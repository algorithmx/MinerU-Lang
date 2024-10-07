import React from 'react';
import logo from './logo.svg';
import './App.css';
import PDFLayoutViewer from './PdfLayoutViewer';



function App() {
  const formatPageNumber = (num: number) => num.toString().padStart(4, '0')

  return (
    <div className="App">
      <PDFLayoutViewer 
        baseUrl="http://localhost:8888"
        filePrefix="Fizika" 
        initialPageNumber={1} 
        formatPageNumber={formatPageNumber} 
      />
    </div>
  );
}

export default App;
