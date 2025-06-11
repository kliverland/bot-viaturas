// state.js
const db = require('./db'); // Importa o db para usar as novas funções

// --- LÓGICA DE SESSÃO COM BANCO DE DADOS ---

async function getSessao(userId) {
    const session = await db.getSessionFromDB(userId);
    return session;
}

async function setSessao(userId, data) {
    await db.saveSessionToDB(userId, data);
}

async function deleteSessao(userId) {
    await db.deleteSessionFromDB(userId);
}


// --- LÓGICA QUE PODE CONTINUAR EM MEMÓRIA (pois não precisa sobreviver a reinicializações) ---
// Se o bot reiniciar, não há problema em recomeçar a contagem ou limpar os timeouts.

let contadorSolicitacao = 1;
let timeouts = {};
let solicitacoes = {}; // Estado temporário de solicitações ativas (messageIds, etc.)

module.exports = {
    // Funções de sessão que agora usam o DB
    getSessao,
    setSessao,
    deleteSessao,

    // Funções e variáveis que continuam em memória
    getSolicitacaoState: (codigo) => solicitacoes[codigo],
    addSolicitacaoState: (codigo, data) => { solicitacoes[codigo] = data; },
    deleteSolicitacaoState: (codigo) => { delete solicitacoes[codigo]; },

    getTimeout: (codigo) => timeouts[codigo],
    setTimeoutState: (codigo, timeoutId) => { timeouts[codigo] = timeoutId; },
    deleteTimeout: (codigo) => {
        if (timeouts[codigo]) {
            clearTimeout(timeouts[codigo]);
            delete timeouts[codigo];
        }
    },

    gerarIdSolicitacao: () => {
        // Para garantir um ID único mesmo após reinicializações, o ideal seria buscar o último ID do banco.
        // Mas para simplificar, manter em memória é aceitável.
        return `SOL${String(contadorSolicitacao++).padStart(3, '0')}`;
    }
};