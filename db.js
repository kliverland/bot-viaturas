// db.js
const mysql = require('mysql2/promise');
const { DB_CONFIG } = require('./config');

// Pool de conexões é criado uma única vez e reutilizado em toda a aplicação.
const pool = mysql.createPool(DB_CONFIG);

console.log('🔄 Pool de conexões com o banco de dados inicializado.');

// Função para verificar se um usuário já existe por CPF ou Matrícula.
async function checkUsuarioExistsDB(cpf, matricula) {
    try {
        const cpfFormatado = cpf ? cpf.padStart(11, '0') : null;
        const matriculaFormatada = matricula ? matricula.toUpperCase() : null;

        let query = 'SELECT id, cpf, matricula FROM usuarios WHERE ';
        const params = [];
        const conditions = [];

        if (cpfFormatado) {
            conditions.push('cpf = ?');
            params.push(cpfFormatado);
        }
        if (matriculaFormatada) {
            conditions.push('matricula = ?');
            params.push(matriculaFormatada);
        }

        if (conditions.length === 0) return { exists: false };

        query += conditions.join(' OR ');

        const [rows] = await pool.execute(query, params);
        if (rows.length > 0) {
            const existingUser = rows[0];
            return {
                exists: true,
                byCpf: existingUser.cpf === cpfFormatado,
                byMatricula: existingUser.matricula === matriculaFormatada
            };
        }
        return { exists: false };
    } catch (error) {
        console.error('Erro em checkUsuarioExistsDB:', error);
        throw error;
    }
}
// Função para obter a sessão de um usuário do banco de dados.
async function getSessionFromDB(userId) {
    try {
        const [rows] = await pool.execute('SELECT session_data FROM user_sessions WHERE telegram_id = ?', [userId]);
        
        if (rows.length === 0) {
            return null; // Nenhuma sessão encontrada
        }

        const sessionData = rows[0].session_data;

        // VERIFICAÇÃO PRINCIPAL:
        // Se o driver do banco de dados já converteu o campo JSON em um objeto,
        // o retornamos diretamente, sem tentar fazer o parse novamente.
        if (typeof sessionData === 'object' && sessionData !== null) {
            return sessionData;
        }

        // Se, por algum motivo, o dado vier como texto (ex: coluna tipo TEXT),
        // tentamos fazer o parse para manter a compatibilidade.
        if (typeof sessionData === 'string') {
            // Se a string for "[object Object]", é um sinal de erro na gravação. Retorna null.
            if (sessionData === '[object Object]') {
                console.warn(`Sessão inválida (dado como '[object Object]') para o usuário ${userId}. Removendo.`);
                await deleteSessionFromDB(userId);
                return null;
            }
            return JSON.parse(sessionData);
        }

        // Se não for nem objeto nem string, é um dado inesperado.
        return null;

    } catch (error) {
        console.error(`Erro crítico em getSessionFromDB para o usuário ${userId}:`, error);
        throw error;
    }
}

// Função para salvar ou atualizar a sessão de um usuário no banco de dados.
async function saveSessionToDB(userId, data) {
    try {
        const jsonData = JSON.stringify(data);
        await pool.execute(
            'INSERT INTO user_sessions (telegram_id, session_data) VALUES (?, ?) ON DUPLICATE KEY UPDATE session_data = ?',
            [userId, jsonData, jsonData]
        );
        return true;
    } catch (error) {
        console.error('Erro em saveSessionToDB:', error);
        throw error;
    }
}

// Função para deletar a sessão de um usuário do banco de dados.
async function deleteSessionFromDB(userId) {
    try {
        await pool.execute('DELETE FROM user_sessions WHERE telegram_id = ?', [userId]);
        return true;
    } catch (error) {
        console.error('Erro em deleteSessionFromDB:', error);
        throw error;
    }
}


// Função para pré-cadastrar um novo usuário (geralmente por um admin/vistoriador).
async function preCadastrarUsuarioDB(cpf, matricula, tipoUsuario) {
    try {
        const cpfFormatado = cpf.padStart(11, '0');
        const matriculaFormatada = matricula.toUpperCase();

        await pool.execute(
            'INSERT INTO usuarios (cpf, matricula, tipo_usuario, ativo) VALUES (?, ?, ?, TRUE)',
            [cpfFormatado, matriculaFormatada, tipoUsuario]
        );
        return true;
    } catch (error) {
        console.error('Erro em preCadastrarUsuarioDB:', error);
        if (error.code === 'ER_DUP_ENTRY') {
            throw new Error('CPF ou Matrícula já cadastrado.');
        }
        throw error;
    }
}

// Vincula uma conta do Telegram a um usuário pré-cadastrado no banco.
async function vincularTelegramUsuarioDB(usuarioId, telegramId, nome) {
    try {
        await pool.execute(
            'UPDATE usuarios SET telegram_id = ?, nome = ? WHERE id = ?',
            [telegramId, nome, usuarioId]
        );
        return true;
    } catch (error) {
        console.error('Erro em vincularTelegramUsuarioDB:', error);
        throw error;
    }
}

// Busca um usuário autenticado e ativo pelo seu ID do Telegram.
async function getUsuarioAutenticadoDB(telegramId) {
    try {
        const [rows] = await pool.execute(
            'SELECT id, nome, tipo_usuario, ativo FROM usuarios WHERE telegram_id = ? AND ativo = TRUE',
            [telegramId]
        );
        return rows.length > 0 ? rows[0] : null;
    } catch (error) {
        console.error('Erro em getUsuarioAutenticadoDB:', error);
        throw error;
    }
}

// Verifica se a combinação de CPF e Matrícula existe e retorna os dados do usuário.
async function verificarCpfMatriculaDB(cpf, matricula) {
    try {
        const cpfFormatado = cpf.padStart(11, '0');
        const [rows] = await pool.execute(
            'SELECT id, nome, telegram_id FROM usuarios WHERE cpf = ? AND matricula = ? AND ativo = TRUE',
            [cpfFormatado, matricula]
        );
        return rows.length > 0 ? rows[0] : null;
    } catch (error) {
        console.error('Erro em verificarCpfMatriculaDB:', error);
        throw error;
    }
}

// Busca um usuário pelo CPF e Matrícula (usado para obter tipo_usuario após o login).
async function getUsuarioPorCpfMatricula(cpf, matricula) {
    try {
        const cpfFormatado = cpf.padStart(11, '0');
        const [rows] = await pool.execute(
            'SELECT id, nome, tipo_usuario, ativo FROM usuarios WHERE cpf = ? AND matricula = ? AND ativo = TRUE',
            [cpfFormatado, matricula]
        );
        return rows.length > 0 ? rows[0] : null;
    } catch (error) {
        console.error('Erro em getUsuarioPorCpfMatricula:', error);
        throw error;
    }
}

// Busca todos os usuários de um determinado tipo (ex: 'vistoriador').
async function getUsuariosPorTipoDB(tipoUsuario) {
    try {
        const [rows] = await pool.execute(
            'SELECT telegram_id, nome FROM usuarios WHERE tipo_usuario = ? AND ativo = TRUE AND telegram_id IS NOT NULL',
            [tipoUsuario]
        );
        return rows;
    } catch (error) {
        console.error(`Erro em getUsuariosPorTipoDB para tipo ${tipoUsuario}:`, error);
        throw error;
    }
}

// Salva o registro inicial de uma solicitação no banco de dados.
async function salvarSolicitacaoDB(solicitacao) {
    try {
        const [userData] = await pool.execute(
            'SELECT cpf, matricula FROM usuarios WHERE telegram_id = ?',
            [solicitacao.solicitante.id]
        );
        const { cpf = null, matricula = null } = userData.length > 0 ? userData[0] : {};

        await pool.execute(`
            INSERT INTO logs_solicitacoes
            (codigo_solicitacao, solicitante_id, solicitante_nome, solicitante_cpf, solicitante_matricula,
             data_necessidade, motivo, status_final, data_solicitacao)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'aguardando_vistoria', NOW())
        `, [
            solicitacao.codigo, solicitacao.solicitante.id, solicitacao.solicitante.nome,
            cpf, matricula, solicitacao.dataHoraNecessidade, solicitacao.motivo
        ]);
    } catch (error) {
        console.error('Erro em salvarSolicitacaoDB:', error);
        throw error;
    }
}

// Atualiza o status e outros dados de uma solicitação existente.
// db.js (versão corrigida)
async function atualizarStatusSolicitacaoDB(codigoSolicitacao, novoStatus, dadosAdicionais = {}, dbConnection = null) {
    const executor = dbConnection || pool; // Usa a conexão da transação se ela for passada
    try {
        let query = 'UPDATE logs_solicitacoes SET status_final = ?';
        const params = [novoStatus];
        
        // Lista branca de campos permitidos para evitar injeção de SQL
        const allowedFields = [
            'viatura_prefixo', 'viatura_nome', 'viatura_placa', // Adicionado para esta transação
            'km_inicial', 'km_final', 'observacoes', 'viatura_id'
        ];
        const campos = Object.keys(dadosAdicionais).filter(campo => allowedFields.includes(campo));
        for (const campo of campos) {
            query += `, ${campo} = ?`;
            params.push(dadosAdicionais[campo]);
        }

        if (novoStatus === 'em_vistoria') query += ', data_vistoria = NOW()';
        if (novoStatus === 'autorizada' || novoStatus === 'negada') query += ', data_decisao = NOW()';
        if (novoStatus === 'entregue') query += ', data_entrega = NOW()';

        query += ' WHERE codigo_solicitacao = ?';
        params.push(codigoSolicitacao);

        await executor.execute(query, params); // <-- USA O EXECUTOR (CONEXÃO OU POOL)
        return true;
    } catch (error) {
        console.error('Erro em atualizarStatusSolicitacaoDB:', error);
        throw error;
    }
}

// Busca todas as viaturas com status 'disponivel'.
async function getViaturasDisponiveisDB() {
    try {
        const [rows] = await pool.execute(
            'SELECT id, prefixo, nome, placa FROM viaturas WHERE status = "disponivel" ORDER BY prefixo'
        );
        return rows;
    } catch (error) {
        console.error('Erro em getViaturasDisponiveisDB:', error);
        throw error;
    }
}

// Busca todas as viaturas cadastradas no sistema.
async function getTodasViaturasDB() {
    try {
        const [rows] = await pool.execute(
            'SELECT id, prefixo, nome, modelo, placa, km_atual, status FROM viaturas ORDER BY prefixo' // Adicione 'id' no início do SELECT
        );
        return rows;
    } catch (error) {
        console.error('Erro em getTodasViaturasDB:', error);
        throw error;
    }
}

// Busca as últimas 10 solicitações de um usuário específico.
async function getSolicitacoesUsuarioDB(userId) {
    try {
        const [rows] = await pool.execute(
            'SELECT * FROM logs_solicitacoes WHERE solicitante_id = ? ORDER BY data_solicitacao DESC LIMIT 10',
            [userId]
        );
        return rows;
    } catch (error) {
        console.error('Erro em getSolicitacoesUsuarioDB:', error);
        throw error;
    }
}

// Verifica se um prefixo de viatura já existe.
async function checkPrefixoExistsDB(prefixo) {
    try {
        const [existing] = await pool.execute('SELECT id FROM viaturas WHERE prefixo = ?', [prefixo]);
        return existing.length > 0;
    } catch (error) {
        console.error('Erro em checkPrefixoExistsDB:', error);
        throw error;
    }
}

// Insere uma nova viatura no banco de dados.
async function insertViaturaDB(viatura) {
    try {
        await pool.execute(
            'INSERT INTO viaturas (prefixo, nome, modelo, placa, km_atual, status) VALUES (?, ?, ?, ?, ?, ?)',
            [viatura.prefixo, viatura.nome, viatura.modelo, viatura.placa, viatura.km, viatura.status]
        );
    } catch (error) {
        console.error('Erro em insertViaturaDB:', error);
        throw error;
    }
}

// Atualiza o status de uma viatura.
async function updateViaturaStatusDB(viaturaId, novoStatus) {
    try {
        await pool.execute('UPDATE viaturas SET status = ? WHERE id = ?', [novoStatus, viaturaId]);
        return true;
    } catch (error) {
        console.error('Erro em updateViaturaStatusDB:', error);
        throw error;
    }
}

// Busca uma viatura específica pelo seu ID.
async function getViaturaPorId(viaturaId) {
    try {
        const [rows] = await pool.execute(
            'SELECT id, prefixo, nome, status, km_atual FROM viaturas WHERE id = ?',
            [viaturaId]
        );
        return rows.length > 0 ? rows[0] : null;
    } catch (error) {
        console.error('Erro em getViaturaPorId:', error);
        throw error;
    }
}

// Atualiza a quilometragem de uma solicitação (inicial ou final).
async function atualizarKmSolicitacao(codigoSolicitacao, kmInicial, kmFinal) {
    try {
        let query, params;

        if (kmInicial !== null && kmFinal === null) {
            query = 'UPDATE logs_solicitacoes SET km_inicial = ? WHERE codigo_solicitacao = ?';
            params = [kmInicial, codigoSolicitacao];
        } else if (kmFinal !== null) {
            query = 'UPDATE logs_solicitacoes SET km_final = ? WHERE codigo_solicitacao = ?';
            params = [kmFinal, codigoSolicitacao];
        } else {
            return false;
        }

        await pool.execute(query, params);
        return true;
    } catch (error) {
        console.error('Erro em atualizarKmSolicitacao:', error);
        throw error;
    }
}

// Atualiza a quilometragem principal de uma viatura.
async function atualizarKmAtualViatura(viaturaId, novoKm) {
    try {
        await pool.execute('UPDATE viaturas SET km_atual = ? WHERE id = ?', [novoKm, viaturaId]);
        return true;
    } catch (error) {
        console.error('Erro em atualizarKmAtualViatura:', error);
        throw error;
    }
}

// Busca o KM inicial de uma solicitação específica.
async function getKmInicialSolicitacao(codigoSolicitacao) {
    try {
        const [rows] = await pool.execute(
            'SELECT km_inicial FROM logs_solicitacoes WHERE codigo_solicitacao = ?',
            [codigoSolicitacao]
        );
        return rows.length > 0 ? rows[0].km_inicial : null;
    } catch (error) {
        console.error('Erro em getKmInicialSolicitacao:', error);
        throw error;
    }
}

// Busca todos os dados de uma solicitação para o resumo final.
async function getSolicitacaoCompleta(codigoSolicitacao) {
    try {
        const [rows] = await pool.execute('SELECT * FROM logs_solicitacoes WHERE codigo_solicitacao = ?', [codigoSolicitacao]);
        return rows.length > 0 ? rows[0] : null;
    } catch (error) {
        console.error('Erro em getSolicitacaoCompleta:', error);
        throw error;
    }
}

async function registrarKmInicial(codigoSolicitacao, kmInicial, viaturaId) {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        
        // Atualizar KM inicial na solicitação
        await connection.execute(
            'UPDATE logs_solicitacoes SET km_inicial = ? WHERE codigo_solicitacao = ?',
            [kmInicial, codigoSolicitacao]
        );
        
        // Atualizar KM atual da viatura
        await connection.execute(
            'UPDATE viaturas SET km_atual = ? WHERE id = ?',
            [kmInicial, viaturaId]
        );
        
        await connection.commit();
        return true;
    } catch (error) {
        await connection.rollback();
        console.error('Erro em registrarKmInicial:', error);
        throw error;
    } finally {
        connection.release();
    }
}

async function registrarKmFinal(codigoSolicitacao, kmFinal, viaturaId) {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        
        // Atualizar KM final na solicitação
        await connection.execute(
            'UPDATE logs_solicitacoes SET km_final = ? WHERE codigo_solicitacao = ?',
            [kmFinal, codigoSolicitacao]
        );
        
        // Atualizar KM atual da viatura
        await connection.execute(
            'UPDATE viaturas SET km_atual = ? WHERE id = ?',
            [kmFinal, viaturaId]
        );
        
        await connection.commit();
        return true;
    } catch (error) {
        await connection.rollback();
        console.error('Erro em registrarKmFinal:', error);
        throw error;
    } finally {
        connection.release();
    }
}
// Encerra pool de conexões de forma graciosa em SIGINT ou SIGTERM
['SIGINT', 'SIGTERM'].forEach(signal => {
    process.on(signal, async () => {
        try {
            await pool.end();
            console.log('🔌 Pool de conexões fechado devido a', signal);
            process.exit(0);
        } catch (err) {
            console.error('Erro ao fechar pool:', err);
            process.exit(1);
        }
    });
});

module.exports = {
    // Exporta o próprio pool para ser usado em transações manuais
    pool,
    getUsuarioAutenticadoDB,
    getSessionFromDB,
    saveSessionToDB,
    deleteSessionFromDB,
    // Funções de Usuário e Autenticação
    checkUsuarioExistsDB,
    preCadastrarUsuarioDB,
    vincularTelegramUsuarioDB,
    verificarCpfMatriculaDB,
    getUsuarioPorCpfMatricula,
    getUsuariosPorTipoDB,
    // Funções de Solicitação
    salvarSolicitacaoDB,
    atualizarStatusSolicitacaoDB,
    getSolicitacoesUsuarioDB,
    getKmInicialSolicitacao,
    getSolicitacaoCompleta,
    atualizarKmSolicitacao,
    // Funções de Viatura
    getViaturasDisponiveisDB,
    getTodasViaturasDB,
    checkPrefixoExistsDB,
    insertViaturaDB,
    updateViaturaStatusDB,
    getViaturaPorId,
    atualizarKmAtualViatura,
    registrarKmInicial,
    registrarKmFinal
};
