import React, { useState, useCallback, useMemo } from 'react';
import { 
  Upload, 
  Database, 
  Code, 
  BarChart3, 
  Trash2, 
  Download, 
  Play, 
  ChevronRight,
  ChevronDown,
  Filter,
  Lightbulb,
  CheckCircle2,
  AlertCircle,
  Loader2
} from 'lucide-react';
import Papa from 'papaparse';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI, Type } from "@google/genai";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, ScatterChart, Scatter
} from 'recharts';
import { cn } from './lib/utils';
import { Dataset, AppMode, DataRow, AnalysisResult } from './types';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export default function App() {
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [mode, setMode] = useState<AppMode>('idle');
  const [loading, setLoading] = useState(false);
  const [instructions, setInstructions] = useState('');
  const [sqlPrompt, setSqlPrompt] = useState('');
  const [sqlResult, setSqlResult] = useState('');
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [cleanedData, setCleanedData] = useState<DataRow[] | null>(null);
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      dynamicTyping: true,
      complete: (results) => {
        setDataset({
          name: file.name,
          columns: results.meta.fields || [],
          data: results.data as DataRow[],
          rowCount: results.data.length
        });
        setMode('idle');
        setActiveFilters({});
        setAnalysisResult(null);
        setCleanedData(null);
      }
    });
  };

  const runCleaning = async (autoDownload = false) => {
    if (!dataset) return;
    setLoading(true);
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `You are a data cleaning expert. Generate a JavaScript function that takes an array of objects (the dataset) and returns a cleaned version of it.
        
        Instructions: "${instructions || 'standard best practices (remove nulls, trim strings, handle duplicates, normalize casing)'}". 
        Dataset schema: ${dataset.columns.join(', ')}. 
        Sample data: ${JSON.stringify(dataset.data.slice(0, 3))}.
        
        The function should be named 'cleanData' and take one argument 'data'.
        Return ONLY the code for the function, no markdown blocks, no explanations. 
        Example structure:
        function cleanData(data) {
          return data.map(row => {
            // cleaning logic here
            return row;
          }).filter(row => row !== null);
        }`,
      });
      
      const code = response.text.replace(/```javascript|```js|```/g, '').trim();
      
      try {
        // Create a safe-ish execution environment
        const cleaner = new Function('data', `${code}; return cleanData(data);`);
        const result = cleaner(dataset.data);
        
        if (Array.isArray(result)) {
          setCleanedData(result);
          if (autoDownload) {
            const csv = Papa.unparse(result);
            const blob = new Blob([csv], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `cleaned_full_${dataset.name}`;
            a.click();
          }
        } else {
          throw new Error("Cleaner did not return an array");
        }
      } catch (execError) {
        console.error("Code execution failed, falling back to direct cleaning:", execError);
        // Fallback: Try direct JSON cleaning for a small sample if code fails
        const fallbackResponse = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: `Clean this dataset sample: ${JSON.stringify(dataset.data.slice(0, 50))}. Instructions: ${instructions}`,
          config: { responseMimeType: "application/json" }
        });
        setCleanedData(JSON.parse(fallbackResponse.text));
      }
    } catch (error) {
      console.error("Cleaning failed:", error);
    } finally {
      setLoading(false);
    }
  };

  const generateSQL = async () => {
    if (!dataset) return;
    setLoading(true);
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Generate a SQL query for the following prompt: "${sqlPrompt}". 
        Table name: "dataset". 
        Columns: ${dataset.columns.join(', ')}. 
        Sample data: ${JSON.stringify(dataset.data.slice(0, 3))}.
        Return only the SQL query string.`,
      });
      setSqlResult(response.text);
    } catch (error) {
      console.error("SQL generation failed:", error);
    } finally {
      setLoading(false);
    }
  };

  const runAnalysis = async () => {
    if (!dataset) return;
    setLoading(true);
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Analyze this dataset. Instructions: "${instructions || 'none'}". 
        Columns: ${dataset.columns.join(', ')}. 
        Sample data: ${JSON.stringify(dataset.data.slice(0, 10))}.
        Provide insights, recommendations, and 4 chart configurations.
        IMPORTANT: Use the EXACT column names from the list above for dataKey and categoryKey.
        The dataKey MUST be a column containing numeric values (prices, counts, scores, etc.).
        The categoryKey should be a column with labels or dates.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              insights: { type: Type.ARRAY, items: { type: Type.STRING } },
              recommendations: { type: Type.ARRAY, items: { type: Type.STRING } },
              charts: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    type: { type: Type.STRING, enum: ['bar', 'line', 'pie', 'scatter'] },
                    title: { type: Type.STRING },
                    dataKey: { type: Type.STRING },
                    categoryKey: { type: Type.STRING },
                    description: { type: Type.STRING }
                  },
                  required: ['type', 'title', 'dataKey', 'categoryKey']
                }
              }
            },
            required: ['insights', 'recommendations', 'charts']
          }
        }
      });
      
      setAnalysisResult(JSON.parse(response.text));
    } catch (error) {
      console.error("Analysis failed:", error);
    } finally {
      setLoading(false);
    }
  };

  const parseNumeric = (val: any): number => {
    if (typeof val === 'number') return val;
    if (typeof val === 'string') {
      const cleaned = val.replace(/[$,%\s]/g, '').replace(/,/g, '');
      const num = parseFloat(cleaned);
      return isNaN(num) ? 0 : num;
    }
    return 0;
  };

  const findDataKey = (row: any, targetKey: string): string => {
    if (!row) return targetKey;
    if (targetKey in row) return targetKey;
    const keys = Object.keys(row);
    const fuzzyMatch = keys.find(k => k.toLowerCase().trim() === targetKey.toLowerCase().trim());
    return fuzzyMatch || targetKey;
  };

  const filteredData = useMemo(() => {
    if (!dataset) return [];
    return dataset.data.filter(row => {
      return Object.entries(activeFilters).every(([key, value]) => {
        if (!value) return true;
        const cellValue = row[key];
        const filterValue = String(value);
        return String(cellValue ?? '').toLowerCase().includes(filterValue.toLowerCase());
      });
    });
  }, [dataset, activeFilters]);

  const COLORS = ['#000000', '#333333', '#666666', '#999999', '#CCCCCC'];

  return (
    <div className="min-h-screen flex flex-col relative bg-[#fcfcfc] text-black">
      {/* Background Image Overlay */}
      <div 
        className="fixed inset-0 z-[-1] bg-cover bg-center bg-no-repeat opacity-10 pointer-events-none grayscale"
        style={{ 
          backgroundImage: `url('https://storage.googleapis.com/static-content-prod/898288593466547200/898288593466547200_1.png')`,
          backgroundAttachment: 'fixed'
        }}
      />
      {/* Subtle Grid Overlay for Technical Feel */}
      <div className="fixed inset-0 z-[-1] bg-[radial-gradient(#e5e5e5_1px,transparent_1px)] [background-size:20px_20px] pointer-events-none" />
      
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b border-black bg-white/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 h-20 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-none bg-black flex items-center justify-center shadow-[4px_4px_0px_0px_rgba(0,0,0,0.2)]">
              <Database className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-2xl font-black text-black tracking-tighter uppercase">
              Easy Data AI
            </h1>
          </div>
          {dataset && (
            <div className="flex items-center gap-4">
              <div className="hidden sm:flex flex-col items-end">
                <span className="text-sm font-bold text-black">{dataset.name}</span>
                <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">{dataset.rowCount} rows</span>
              </div>
              <button 
                onClick={() => { setDataset(null); setMode('idle'); }}
                className="p-2.5 text-neutral-400 hover:text-black transition-all duration-200"
                title="Remove dataset"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="flex-1 p-8 max-w-7xl mx-auto w-full">
        <AnimatePresence mode="wait">
          {!dataset ? (
            <motion.div 
              key="upload"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="max-w-2xl mx-auto mt-20"
            >
              <div className="modern-card p-12 flex flex-col items-center text-center border-2 border-black bg-white">
                <div className="w-20 h-20 rounded-none bg-black flex items-center justify-center mb-8 shadow-[6px_6px_0px_0px_rgba(0,0,0,0.1)]">
                  <Upload className="w-10 h-10 text-white" />
                </div>
                <p className="text-neutral-600 mb-10 max-w-sm font-medium">Upload your CSV to start cleaning, querying, and analyzing with technical precision.</p>
                
                <label className="btn-primary px-10 py-4 cursor-pointer group">
                  <span className="flex items-center gap-2">
                    <Upload className="w-5 h-5 group-hover:-translate-y-0.5 transition-transform" />
                    SELECT DATASET
                  </span>
                  <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
                </label>
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key="dashboard"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-8"
            >
              {/* Mode Selection */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                  { id: 'cleaning', label: 'Data Cleaning', icon: Trash2, desc: 'AI-driven standardization & cleanup', color: 'indigo' },
                  { id: 'sql', label: 'SQL Generator', icon: Code, desc: 'Natural language to SQL queries', color: 'purple' },
                  { id: 'analysis', label: 'Data Analysis', icon: BarChart3, desc: 'Visual insights & recommendations', color: 'pink' }
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setMode(item.id as AppMode)}
                    className={cn(
                      "modern-card p-8 text-left transition-all duration-300 group relative overflow-hidden",
                      mode === item.id 
                        ? "bg-black text-white shadow-[8px_8px_0px_0px_rgba(0,0,0,0.2)]" 
                        : "hover:bg-neutral-50"
                    )}
                  >
                    <div className={cn(
                      "w-14 h-14 rounded-none flex items-center justify-center mb-6 transition-colors duration-300 border border-black",
                      mode === item.id ? "bg-white text-black" : "bg-white text-black group-hover:bg-black group-hover:text-white"
                    )}>
                      <item.icon className="w-7 h-7" />
                    </div>
                    <h3 className={cn("text-xl font-black uppercase tracking-tight mb-2", mode === item.id ? "text-white" : "text-black")}>{item.label}</h3>
                    <p className={cn("text-sm leading-relaxed", mode === item.id ? "text-neutral-400" : "text-neutral-500")}>{item.desc}</p>
                    
                    {mode === item.id && (
                      <motion.div 
                        layoutId="active-indicator"
                        className="absolute bottom-0 left-0 right-0 h-2 bg-white"
                      />
                    )}
                  </button>
                ))}
              </div>

              {/* Mode Content */}
              <div className="modern-card min-h-[500px] bg-neutral-900/50 shadow-2xl shadow-black/50">
                {mode === 'idle' && (
                  <div className="p-20 text-center">
                    <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-6">
                      <Database className="w-10 h-10 text-gray-600" />
                    </div>
                    <h3 className="text-2xl font-bold text-white mb-2">Ready to process {dataset.name}</h3>
                    <p className="text-gray-400">Choose a tool above to start transforming your data.</p>
                  </div>
                )}

                {mode === 'cleaning' && (
                  <div className="p-10 space-y-8">
                    <div className="space-y-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-2xl font-bold text-white">Data Cleaning</h3>
                          <p className="text-sm text-gray-400">Define how you want your data to be structured.</p>
                        </div>
                      </div>
                      
                      <textarea 
                        value={instructions}
                        onChange={(e) => setInstructions(e.target.value)}
                        placeholder="e.g., Remove duplicates, handle missing values in 'Price' column, format dates to YYYY-MM-DD..."
                        className="input-modern w-full h-40 p-5 text-base"
                      />
                      
                      <div className="flex items-center gap-4">
                        <button 
                          onClick={() => runCleaning(true)}
                          disabled={loading}
                          className="btn-primary px-8 py-4 flex items-center gap-3 disabled:opacity-50"
                        >
                          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
                          <span className="font-bold">Clean & Download Full Table</span>
                        </button>
                      </div>
                    </div>

                    {cleanedData && (
                      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="pt-10 border-t border-white/5">
                        <div className="flex justify-between items-center mb-6">
                          <h4 className="text-lg font-bold text-white">Preview: Cleaned Results</h4>
                          <button 
                            onClick={() => {
                              const csv = Papa.unparse(cleanedData);
                              const blob = new Blob([csv], { type: 'text/csv' });
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = url;
                              a.download = `cleaned_${dataset.name}`;
                              a.click();
                            }}
                            className="btn-secondary px-4 py-2 text-xs flex items-center gap-2"
                          >
                            <Download className="w-4 h-4" /> Download CSV
                          </button>
                        </div>
                        <div className="overflow-x-auto rounded-2xl border border-white/5 shadow-sm">
                          <table className="w-full text-left text-sm">
                            <thead className="bg-white/5 border-b border-white/5">
                              <tr>
                                {Object.keys(cleanedData[0] || {}).map(col => (
                                  <th key={col} className="p-4 font-bold text-gray-500 uppercase tracking-wider text-[10px]">{col}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                              {cleanedData.slice(0, 10).map((row, i) => (
                                <tr key={i} className="hover:bg-white/5 transition-colors">
                                  {Object.values(row).map((val, j) => (
                                    <td key={j} className="p-4 text-gray-400 truncate max-w-[200px]">{String(val)}</td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </motion.div>
                    )}
                  </div>
                )}

                {mode === 'sql' && (
                  <div className="p-10 space-y-8">
                    <div className="space-y-6">
                      <div>
                        <h3 className="text-2xl font-bold text-white">SQL Generator</h3>
                        <p className="text-sm text-gray-400">Describe the query you need in plain English.</p>
                      </div>
                      
                      <div className="relative">
                        <input 
                          value={sqlPrompt}
                          onChange={(e) => setSqlPrompt(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && sqlPrompt && !loading) {
                              generateSQL();
                            }
                          }}
                          placeholder="e.g., Show me the top 10 products by revenue in 2023..."
                          className="input-modern w-full p-6 pr-16 text-lg"
                        />
                        <div className="absolute right-4 top-1/2 -translate-y-1/2">
                          {loading ? (
                            <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
                          ) : (
                            <div className="p-2 rounded-lg bg-white/5 text-gray-500 text-[10px] font-bold uppercase tracking-widest">Enter</div>
                          )}
                        </div>
                      </div>
                    </div>

                    {sqlResult && (
                      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                        <div className="flex justify-between items-center">
                          <h4 className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Generated SQL Query</h4>
                          <button 
                            onClick={() => navigator.clipboard.writeText(sqlResult)}
                            className="btn-secondary px-3 py-1.5 text-[10px] uppercase font-bold tracking-wider"
                          >
                            Copy to Clipboard
                          </button>
                        </div>
                        <div className="relative group">
                          <textarea 
                            value={sqlResult}
                            onChange={(e) => setSqlResult(e.target.value)}
                            className="w-full h-64 p-8 bg-black text-indigo-400 font-mono text-base rounded-3xl shadow-2xl border border-white/5 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
                          />
                          <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Code className="w-6 h-6 text-gray-700" />
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </div>
                )}

                {mode === 'analysis' && (
                  <div className="p-10 space-y-10">
                    <div className="space-y-6">
                      <div>
                        <h3 className="text-2xl font-black text-black uppercase tracking-tighter">Data Analysis</h3>
                        <p className="text-sm text-neutral-500 font-medium">Extract technical insights and visualizations.</p>
                      </div>
                      
                      <textarea 
                        value={instructions}
                        onChange={(e) => setInstructions(e.target.value)}
                        placeholder="e.g., Focus on quarterly trends, identify outliers in revenue, compare performance across regions..."
                        className="input-modern w-full h-32 p-5"
                      />
                      
                      <div className="flex gap-4">
                        <button 
                          onClick={runAnalysis}
                          disabled={loading}
                          className="btn-primary px-8 py-3 flex items-center gap-3 disabled:opacity-50"
                        >
                          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <BarChart3 className="w-5 h-5" />}
                          <span className="font-black uppercase tracking-widest">Run Analysis</span>
                        </button>
                      </div>
                    </div>

                    {analysisResult && (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-16">
                        {/* Filters */}
                        {/* Filters Accordion */}
                        <div className="border-2 border-black overflow-hidden">
                          <button 
                            onClick={() => setIsFiltersOpen(!isFiltersOpen)}
                            className="w-full p-6 bg-black text-white flex items-center justify-between hover:bg-neutral-800 transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <Filter className="w-5 h-5" />
                              <h4 className="text-lg font-black uppercase tracking-tighter">Data Filters</h4>
                              {Object.keys(activeFilters).length > 0 && (
                                <span className="bg-white text-black px-2 py-0.5 text-[10px] font-black">
                                  {Object.keys(activeFilters).length} ACTIVE
                                </span>
                              )}
                            </div>
                            <ChevronDown className={`w-6 h-6 transition-transform duration-300 ${isFiltersOpen ? 'rotate-180' : ''}`} />
                          </button>
                          
                          <AnimatePresence>
                            {isFiltersOpen && (
                              <motion.div 
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.3, ease: 'easeInOut' }}
                              >
                                <div className="p-8 bg-neutral-50 border-t-2 border-black">
                                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                                    {dataset.columns.slice(0, 8).map(col => {
                                      const uniqueValues = Array.from(new Set(dataset.data.map(row => String(row[col]))))
                                        .filter(v => v && v !== 'null' && v !== 'undefined')
                                        .sort();
                                      
                                      return (
                                        <div key={col} className="space-y-2">
                                          <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">{col}</label>
                                          <select 
                                            value={activeFilters[col] || ''}
                                            onChange={(e) => {
                                              const val = e.target.value;
                                              setActiveFilters(prev => {
                                                const next = { ...prev };
                                                if (!val) delete next[col];
                                                else next[col] = val;
                                                return next;
                                              });
                                            }}
                                            className="w-full p-3 bg-white border border-black text-sm text-black font-bold focus:outline-none appearance-none cursor-pointer hover:bg-neutral-100 transition-colors"
                                            style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0/0/24/24\' stroke=\'black\'%3E%3Cpath stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'2\' d=\'M19 9l-7 7-7-7\'/%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 1rem center', backgroundSize: '1em' }}
                                          >
                                            <option value="">ALL VALUES</option>
                                            {uniqueValues.slice(0, 100).map(val => (
                                              <option key={val} value={val}>{val}</option>
                                            ))}
                                          </select>
                                        </div>
                                      );
                                    })}
                                  </div>
                                  {Object.keys(activeFilters).length > 0 && (
                                    <div className="mt-8 pt-6 border-t border-neutral-200">
                                      <button 
                                        onClick={() => setActiveFilters({})}
                                        className="text-[10px] font-black text-black uppercase tracking-widest hover:underline"
                                      >
                                        Clear All Filters
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>

                        {/* Insights & Recommendations */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                          <div className="space-y-6">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 border-2 border-black flex items-center justify-center">
                                <Lightbulb className="w-6 h-6 text-black" />
                              </div>
                              <h4 className="text-xl font-black text-black uppercase tracking-tighter">Key Insights</h4>
                            </div>
                            <div className="space-y-4">
                              {analysisResult.insights.map((insight, i) => (
                                <motion.div 
                                  initial={{ opacity: 0, x: -10 }}
                                  animate={{ opacity: 1, x: 0 }}
                                  transition={{ delay: i * 0.1 }}
                                  key={i} 
                                  className="p-4 bg-white border border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,0.1)] flex gap-4"
                                >
                                  <CheckCircle2 className="w-5 h-5 mt-0.5 flex-shrink-0 text-black" />
                                  <span className="text-black font-medium leading-relaxed">{insight}</span>
                                </motion.div>
                              ))}
                            </div>
                          </div>
                          
                          <div className="space-y-6">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 border-2 border-black flex items-center justify-center">
                                <AlertCircle className="w-6 h-6 text-black" />
                              </div>
                              <h4 className="text-xl font-black text-black uppercase tracking-tighter">Recommendations</h4>
                            </div>
                            <div className="space-y-4">
                              {analysisResult.recommendations.map((rec, i) => (
                                <motion.div 
                                  initial={{ opacity: 0, x: 10 }}
                                  animate={{ opacity: 1, x: 0 }}
                                  transition={{ delay: i * 0.1 }}
                                  key={i} 
                                  className="p-4 bg-white border border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,0.1)] flex gap-4"
                                >
                                  <ChevronRight className="w-5 h-5 mt-0.5 flex-shrink-0 text-black" />
                                  <span className="text-black font-medium leading-relaxed">{rec}</span>
                                </motion.div>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Visualizations */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                          {analysisResult.charts.map((chart, i) => {
                            const actualDataKey = findDataKey(filteredData[0], chart.dataKey);
                            const actualCategoryKey = findDataKey(filteredData[0], chart.categoryKey);
                            
                            const chartData = filteredData.slice(0, 20).map(row => ({
                              ...row,
                              [actualDataKey]: parseNumeric(row[actualDataKey])
                            }));

                            return (
                              <motion.div 
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: i * 0.1 }}
                                key={`${chart.title}-${i}`} 
                                className="modern-card p-8 space-y-6 min-h-[500px] flex flex-col"
                              >
                                <div className="flex justify-between items-start">
                                  <div>
                                    <h5 className="text-lg font-black text-black uppercase tracking-tight">{chart.title}</h5>
                                    <p className="text-xs text-neutral-400 font-bold mt-1 uppercase tracking-widest">{chart.description}</p>
                                  </div>
                                  <div className="p-2 border border-black">
                                    <BarChart3 className="w-4 h-4 text-black" />
                                  </div>
                                </div>
                                <div className="flex-grow w-full pt-4 relative bg-white border-2 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,0.05)] overflow-hidden min-h-[350px]">
                                  {chartData.length > 0 ? (
                                    <div className="absolute inset-0 p-4">
                                      <ResponsiveContainer width="99%" height="100%">
                                        {chart.type === 'bar' ? (
                                          <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e5e5" />
                                            <XAxis 
                                              dataKey={actualCategoryKey} 
                                              fontSize={10} 
                                              tickLine={true} 
                                              axisLine={true}
                                              tick={{ fill: '#000', fontWeight: 'bold' }}
                                              angle={-45}
                                              textAnchor="end"
                                              interval={0}
                                            />
                                            <YAxis 
                                              fontSize={10} 
                                              tickLine={true} 
                                              axisLine={true}
                                              tick={{ fill: '#000', fontWeight: 'bold' }}
                                            />
                                            <Tooltip 
                                              contentStyle={{ backgroundColor: '#000', border: 'none', color: '#fff', borderRadius: '0px', fontWeight: 'bold' }}
                                              itemStyle={{ color: '#fff' }}
                                              cursor={{ fill: 'rgba(0,0,0,0.05)' }}
                                            />
                                            <Bar 
                                              dataKey={actualDataKey} 
                                              fill="#000000" 
                                              radius={0} 
                                              isAnimationActive={false}
                                              barSize={30}
                                            />
                                          </BarChart>
                                        ) : chart.type === 'line' ? (
                                          <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e5e5" />
                                            <XAxis 
                                              dataKey={actualCategoryKey} 
                                              fontSize={10} 
                                              tickLine={true} 
                                              axisLine={true} 
                                              tick={{ fill: '#000', fontWeight: 'bold' }}
                                              angle={-45}
                                              textAnchor="end"
                                              interval={0}
                                            />
                                            <YAxis fontSize={10} tickLine={true} axisLine={true} tick={{ fill: '#000', fontWeight: 'bold' }} />
                                            <Tooltip contentStyle={{ backgroundColor: '#000', border: 'none', color: '#fff', borderRadius: '0px' }} itemStyle={{ color: '#fff' }} />
                                            <Line 
                                              type="monotone" 
                                              dataKey={actualDataKey} 
                                              stroke="#000000" 
                                              strokeWidth={3} 
                                              dot={{ r: 4, fill: '#000', strokeWidth: 0 }} 
                                              activeDot={{ r: 6 }}
                                              isAnimationActive={false}
                                            />
                                          </LineChart>
                                        ) : chart.type === 'pie' ? (
                                          <PieChart>
                                            <Pie
                                              data={chartData.slice(0, 8)}
                                              dataKey={actualDataKey}
                                              nameKey={actualCategoryKey}
                                              cx="50%"
                                              cy="50%"
                                              innerRadius={60}
                                              outerRadius={100}
                                              paddingAngle={2}
                                              label={{ fontSize: 10, fill: '#000', fontWeight: 'bold' }}
                                              isAnimationActive={false}
                                            >
                                              {chartData.slice(0, 8).map((_, index) => (
                                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="#fff" strokeWidth={2} />
                                              ))}
                                            </Pie>
                                            <Tooltip contentStyle={{ backgroundColor: '#000', border: 'none', color: '#fff', borderRadius: '0px' }} itemStyle={{ color: '#fff' }} />
                                            <Legend verticalAlign="bottom" height={36} iconType="square" wrapperStyle={{ fontSize: '10px', color: '#000', fontWeight: 'bold' }} />
                                          </PieChart>
                                        ) : (
                                          <ScatterChart margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                                            <XAxis 
                                              dataKey={actualCategoryKey} 
                                              fontSize={10} 
                                              tick={{ fill: '#000', fontWeight: 'bold' }}
                                              name={actualCategoryKey}
                                            />
                                            <YAxis 
                                              dataKey={actualDataKey} 
                                              fontSize={10} 
                                              tick={{ fill: '#000', fontWeight: 'bold' }}
                                              name={actualDataKey}
                                            />
                                            <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ backgroundColor: '#000', border: 'none', color: '#fff', borderRadius: '0px' }} itemStyle={{ color: '#fff' }} />
                                            <Scatter 
                                              name={chart.title} 
                                              data={chartData} 
                                              fill="#000000" 
                                              isAnimationActive={false}
                                            />
                                          </ScatterChart>
                                        )}
                                      </ResponsiveContainer>
                                    </div>
                                  ) : (
                                    <div className="h-full w-full flex flex-col items-center justify-center text-gray-400 gap-2">
                                      <AlertCircle className="w-8 h-8 opacity-20" />
                                      <p className="text-sm">No data available for this chart</p>
                                    </div>
                                  )}
                                </div>
                              </motion.div>
                            );
                          })}
                        </div>
                      </motion.div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="max-w-7xl mx-auto w-full p-10 text-center">
        <div className="flex flex-col items-center gap-4">
          <div className="flex items-center gap-2 text-black text-xs font-black uppercase tracking-[0.2em]">
            <span>Easy Data AI</span>
            <span className="w-1 h-1 rounded-full bg-black" />
            <span>Technical Edition</span>
          </div>
          <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-widest">
            &copy; 2026 &bull; Secure AI Data Processing &bull; RAW ENGINE v3.0
          </p>
        </div>
      </footer>
    </div>
  );
}
