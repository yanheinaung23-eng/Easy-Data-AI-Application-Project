# Meet your data's best friend | Easy Data AI 🚀
![alt image](https://github.com/yanheinaung23-eng/Easy-Data-AI-Application-Project/blob/c399b39f7a4d533adf2995eacf5d74cc0cc1e541/Photos/Your%20Data%E2%80%99s%20New%20Best%20Friend.%20(2).png)
### Easy Data AI is a full-stack React application designed for data analysts and business users to clean the messy datasets, SQL code generation, and data analysis, visualization and insights, available on all platforms.
Test and use the app on google AI studio - (https://ai.studio/apps/4d7b5f1e-1644-4ed7-b114-a4b4c7335963?fullscreenApplet=true).

- AI-Driven Data Cleaning: Uses LLMs to generate custom JavaScript cleaning functions and downloadable csv file.

- Natural Language SQL Generation: Converts plain English into structured SQL queries.

- Automated Data Analysis: Produces technical insights, recommendations, and dynamic visualizations.
![alt image](https://github.com/yanheinaung23-eng/Easy-Data-AI-Application-Project/blob/d42e99427d047abe3b2d4d2b5cc109c38a203212/Photos/phone%20ads.png)

### Technical Stack 🛠️

- Data Parsing: PapaParse (Fast, browser-based CSV parsing).
- AI Engine: Google Gemini 1.5 Flash (via @google/genai).
- Visualizations: Recharts (D3-based responsive charts).
- Animations: Motion.
  
# How to use the app | Step by step guide

### Main page : uploading dataset.
![alt image](https://github.com/yanheinaung23-eng/Easy-Data-AI-Application-Project/blob/b238312ad6d1ae9e5a507cbdb34f0f840aa5e23b/Photos/htu%201.png)
### Choose between 3 services
![alt image](https://github.com/yanheinaung23-eng/Easy-Data-AI-Application-Project/blob/b238312ad6d1ae9e5a507cbdb34f0f840aa5e23b/Photos/htu%202.png)
### Data Cleaning : Can skip the instructons and let the AI do as its best practices or give instructions to AI for cleaning data
![alt image](https://github.com/yanheinaung23-eng/Easy-Data-AI-Application-Project/blob/b238312ad6d1ae9e5a507cbdb34f0f840aa5e23b/Photos/htu%205.png)
### SQL Code Generator : Give instructions what SQL code you want from your dataset.
![alt image](https://github.com/yanheinaung23-eng/Easy-Data-AI-Application-Project/blob/b238312ad6d1ae9e5a507cbdb34f0f840aa5e23b/Photos/htu%204.png)
### Data Analysis : Can skip the instructons and let the AI do as its best practices or give instructions to AI for data analysis
![alt image](https://github.com/yanheinaung23-eng/Easy-Data-AI-Application-Project/blob/0ae2ab64f50dd741da3d06bdd92d85f483674491/Photos/Data%20analysis%20and%20visualizations.png)

# Portfolio Disclaimer⚠️ 
### Project Status: This application is a functional prototype developed specifically for my professional portfolio.
Public Access: For security and API quota management, the live version of this app is currently not available for public use.
API Integration: The backend logic requires a private Google Gemini API key to function.

## How to Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`
