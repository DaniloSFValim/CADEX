import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './lib/auth';
import { App } from './App';
import { LimiteDeErro } from './components/LimiteDeErro';
import '@fontsource-variable/public-sans';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <LimiteDeErro>
        <AuthProvider>
          <App />
        </AuthProvider>
      </LimiteDeErro>
    </BrowserRouter>
  </React.StrictMode>,
);
