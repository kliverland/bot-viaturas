// config.js
require('dotenv').config(); // Carrega variáveis do .env

module.exports = {
    TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    DB_CONFIG: {
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD,
        database: process.env.DB_DATABASE || 'bot_viaturas',
        port: parseInt(process.env.DB_PORT) || 3306
    },
    STATUS_VIATURAS: {
        'disponivel': '✅ Disponível',
        'cedida': '🚗 Cedida',
        'baixada': '❌ Baixada',
        'disposicao': '🔄 À Disposição',
        'manutencao': '🔧 Em Manutenção',
        'reservada': '🔒 Reservada',
        'em_uso': '🚨 Em Uso'
    },
    NIVEIS_PERMISSAO: {
        'solicitante': 1,
        'radio_operador': 2,
        'vistoriador': 3,
        'autorizador': 4
    },
    ANTECEDENCIA_MINIMA_MINUTOS: parseInt(process.env.ANTECEDENCIA_MINIMA_MINUTOS) || 30,
    TIPOS_USUARIO_CADASTRO: [
        { label: '👤 Solicitante', value: 'solicitante' },
        { label: '🛠️ Vistoriador', value: 'vistoriador' },
        { label: '🔑 Autorizador', value: 'autorizador' },
        { label: '📻 Rádio-Operador', value: 'radio_operador' }
    ],
    NODE_ENV: process.env.NODE_ENV || 'development',
    LOG_LEVEL: process.env.LOG_LEVEL || 'info'
};