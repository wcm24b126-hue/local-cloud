import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {isDockerBackendEnabled} from './sim/mode';
import './index.css';

// Always false: calling it here only surfaces the one-time warning when someone
// sets ENABLE_DOCKER_BACKEND=true.
isDockerBackendEnabled();

createRoot(document.getElementById('root')!).render(<App />);
