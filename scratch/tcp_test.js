const tls = require('tls');
const net = require('net');

// Testar se a conexão TCP direta funciona primeiro
const socket = net.createConnection({ host: '54.94.90.106', port: 6543 }, () => {
  console.log('TCP conectado!');
  socket.destroy();
});
socket.on('error', (e) => console.error('TCP erro:', e.message));
socket.setTimeout(5000, () => { console.log('TCP timeout'); socket.destroy(); });
