// main.js
'use strict';
require('dotenv').config(); // Carrega .env antes de tudo

const TelegramBot = require('node-telegram-bot-api');
const config = require('./config');
const botHandlers = require('./controllers/botHandlers');

// Validação mais robusta
if (!config.TOKEN) {
    console.error("❌ Erro: TELEGRAM_BOT_TOKEN não definido!");
    console.error("💡 Verifique se existe o arquivo .env com TELEGRAM_BOT_TOKEN=seu_token");
    process.exit(1);
}

if (!config.DB_CONFIG.password) {
    console.error("❌ Erro: DB_PASSWORD não definido no .env!");
    process.exit(1);
}

const bot = new TelegramBot(config.TOKEN, { polling: true });

// Inicializa os handlers do bot
botHandlers.init(bot);

// Tratamento de erros global (opcional, mas recomendado)
bot.on('polling_error', (error) => {
    console.error(`Erro de Polling: ${error.code} - ${error.message}`);
    // Códigos de erro comuns: ETELEGRAM, ECONNRESET, EAI_AGAIN, ESOCKETTIMEDOUT
    // Para ETELEGRAM com 401 (Unauthorized), o token pode ser inválido.
    // Para ETELEGRAM com 409 (Conflict), outra instância do bot pode estar rodando com o mesmo token.
    if (error.message.includes("409 Conflict")) {
        console.error("!!!!!!!! CONFLITO DETECTADO: Outra instância do bot pode estar rodando com o mesmo token. !!!!!!!!");
        process.exit(1); // Termina o processo para evitar comportamento inesperado
    }
});

process.on('uncaughtException', (error) => {
    console.error('Erro Não Capturado (uncaughtException):', error);
    // Considere sair do processo para evitar estado inconsistente: process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Promise Rejeitada Não Tratada (unhandledRejection):', reason);
});

console.log('🚗 Bot de Viaturas iniciado com sucesso!');
console.log('Aguardando mensagens...');
