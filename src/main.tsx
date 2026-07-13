import ReactDOM from 'react-dom/client';
import App from './App';

/* Local fonts (bundled from node_modules — no CDN) */
import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';
import '@fontsource/dm-sans/700.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/600.css';
import '@fontsource/jetbrains-mono/700.css';

import './styles/theme.css';
import './styles/themes.css';
import './styles/app.css';

import { initUiStyle } from './themes/uiStyles';

/* apply persisted UI style + custom css before first paint */
initUiStyle();

/* No StrictMode: the double-mount in dev would create and tear down
   the WebGL context twice on every load. */
ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
