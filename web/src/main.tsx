import React from 'react';
import { createRoot } from 'react-dom/client';
import { api } from '@/lib/api';
import App from './App';
import { AccessGate } from './components/AccessGate';
import './index.css';

// 既存ページ/ストアは window.api(AppApi) を呼ぶ。Web版では端末内(IndexedDB)＋
// ブラウザ直叩きOCR の実装(api)を代入する。ログイン不要・端末内完結。
window.api = api;

const container = document.getElementById('root');
if (!container) throw new Error('#root not found');
createRoot(container).render(
  <React.StrictMode>
    {/* パスワードゲート（任意）。未設定なら素通り、設定時は解錠までAppを描画しない。 */}
    <AccessGate>
      <App />
    </AccessGate>
  </React.StrictMode>,
);
