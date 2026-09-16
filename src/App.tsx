/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { HashRouter, Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage';
import RefereePage from './pages/RefereePage';
import JuryPage from './pages/JuryPage';
import DisplayPage from './pages/DisplayPage';
import UpdatePrompt from './components/UpdatePrompt';
import InstallPrompt from './components/InstallPrompt';

export default function App() {
  return (
    <HashRouter>
      <UpdatePrompt />
      <InstallPrompt />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/referee" element={<RefereePage />} />
        <Route path="/jury" element={<JuryPage />} />
        <Route path="/display" element={<DisplayPage />} />
      </Routes>
    </HashRouter>
  );
}
