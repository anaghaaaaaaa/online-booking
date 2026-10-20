export const logger = {
  info(message, context = {}) {
    console.log(JSON.stringify({ level: 'info', message, ...context, timestamp: new Date().toISOString() }));
  },
  error(message, context = {}) {
    console.error(JSON.stringify({ level: 'error', message, ...context, timestamp: new Date().toISOString() }));
  }
};
