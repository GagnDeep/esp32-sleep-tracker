import { render } from 'preact';
import { App } from './App';
import { registerSW } from './lib/pwa';
import './styles/tailwind.css';

const root = document.getElementById('app');
if (root) render(<App />, root);

registerSW();
