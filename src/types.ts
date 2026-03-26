export interface DataRow {
  [key: string]: any;
}

export interface Dataset {
  name: string;
  columns: string[];
  data: DataRow[];
  rowCount: number;
}

export type AppMode = 'idle' | 'cleaning' | 'sql' | 'analysis';

export interface AnalysisResult {
  insights: string[];
  recommendations: string[];
  charts: ChartConfig[];
}

export interface ChartConfig {
  type: 'bar' | 'line' | 'pie' | 'scatter';
  title: string;
  dataKey: string;
  categoryKey: string;
  description: string;
}
