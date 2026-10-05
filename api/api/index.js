// Entrada de Vercel. Reutiliza la misma aplicación que corre en local para que
// no haya dos-serving que mantener en paralelo.
import { app } from '../src/server.js';

export default app;