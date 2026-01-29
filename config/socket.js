/**
 * Socket Configuration (Legacy Re-export)
 * 
 * This file re-exports from the new location for backward compatibility.
 * New code should import from 'src/loaders/socket.loader.js'
 * 
 * @deprecated Import from 'src/loaders/socket.loader.js' instead
 */

export { 
  initializeSocketIO, 
  getIO, 
  getRedisClients, 
  closeSocketIO 
} from '../src/loaders/socket.loader.js';

import { 
  initializeSocketIO, 
  getIO, 
  getRedisClients, 
  closeSocketIO 
} from '../src/loaders/socket.loader.js';

export default { initializeSocketIO, getIO, getRedisClients, closeSocketIO };
