import React from 'react';
import { LocalCloudProvider } from './context/LocalCloudContext';
import { AppShell } from './components/shell/AppShell';

export default function App() {
  return (
    <LocalCloudProvider>
      <AppShell />
    </LocalCloudProvider>
  );
}
