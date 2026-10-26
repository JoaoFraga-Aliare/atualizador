import 'dotenv/config';
import { createApp } from './app.js';

const { server, port } = createApp();
server.listen(port, () => console.log(`Central de Atualizacao API: ${server.address().port}`));
