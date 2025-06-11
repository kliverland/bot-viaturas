// stateManager.js
'use strict';
const db = require('./db');

class StateManager {
    constructor() {
        this.requests = new Map();
        this.timeouts = new Map();
        this.requestCounter = 1;
        this.startTime = new Date();
        
        console.log('✅ StateManager inicializado.');
        console.log('📊 Sessões: Banco de dados | Requests: Memória');
        
        // Limpeza automática opcional (a cada 30 minutos)
        this.cleanupInterval = setInterval(() => {
            this.cleanupOldRequests();
        }, 30 * 60 * 1000);
    }

    // === SESSÕES (BANCO DE DADOS) ===
    async getSession(userId) {
        try {
            return await db.getSessionFromDB(String(userId));
        } catch (error) {
            console.error(`Erro ao buscar sessão ${userId}:`, error);
            throw error;
        }
    }

    async setSession(userId, data) {
        if (!data || typeof data !== 'object') {
            throw new Error('Dados de sessão inválidos');
        }
        try {
            await db.saveSessionToDB(String(userId), data);
        } catch (error) {
            console.error(`Erro ao salvar sessão ${userId}:`, error);
            throw error;
        }
    }

    async deleteSession(userId) {
        try {
            return await db.deleteSessionFromDB(String(userId));
        } catch (error) {
            console.error(`Erro ao deletar sessão ${userId}:`, error);
            throw error;
        }
    }

    // === SOLICITAÇÕES (MEMÓRIA) ===
    getRequest(codigo) {
        return this.requests.get(codigo);
    }

    setRequest(codigo, data) {
        if (!codigo || !data) {
            throw new Error('Código ou dados da solicitação inválidos');
        }
        data.updatedAt = new Date();
        this.requests.set(codigo, data);
    }

    deleteRequest(codigo) {
        this.clearRequestTimeout(codigo);
        return this.requests.delete(codigo);
    }

    // === TIMEOUTS (MEMÓRIA) ===
    setRequestTimeout(codigo, callback, delay) {
        this.clearRequestTimeout(codigo);
        const timeoutId = setTimeout(() => {
            callback();
            this.timeouts.delete(codigo);
        }, delay);
        this.timeouts.set(codigo, timeoutId);
    }

    clearRequestTimeout(codigo) {
        const timeoutId = this.timeouts.get(codigo);
        if (timeoutId) {
            clearTimeout(timeoutId);
            this.timeouts.delete(codigo);
        }
    }

    // === UTILITÁRIOS ===
    generateRequestId() {
        const id = `SOL${String(this.requestCounter++).padStart(3, '0')}`;
        return id;
    }

    getStatus() {
        return {
            activeRequests: this.requests.size,
            activeTimeouts: this.timeouts.size,
            nextRequestId: this.requestCounter,
            uptime: Math.floor((new Date() - this.startTime) / 1000),
            startTime: this.startTime.toISOString()
        };
    }

    cleanupOldRequests() {
        const now = new Date();
        const maxAge = 2 * 60 * 60 * 1000; // 2 horas
        let cleaned = 0;
        
        for (const [codigo, data] of this.requests.entries()) {
            if (data.updatedAt && (now - data.updatedAt) > maxAge) {
                this.deleteRequest(codigo);
                cleaned++;
            }
        }
        
        if (cleaned > 0) {
            console.log(`🧹 Limpeza automática: ${cleaned} requests antigos removidos`);
        }
    }

    // Graceful shutdown
    shutdown() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        
        // Limpar todos os timeouts
        for (const [codigo] of this.timeouts.entries()) {
            this.clearRequestTimeout(codigo);
        }
        
        console.log('🛑 StateManager finalizado');
    }
}

// Singleton
const stateManager = new StateManager();

// Graceful shutdown
process.on('SIGINT', () => {
    stateManager.shutdown();
});

process.on('SIGTERM', () => {
    stateManager.shutdown();
});

module.exports = stateManager;
