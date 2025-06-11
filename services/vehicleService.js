// services/vehicleService.js
const db = require('../db');
const { STATUS_VIATURAS } = require('../config');
const stateManager = require('../stateManager');

async function processarCadastroViatura(bot, userId) {
    const sessao = await stateManager.getSession(userId);
    if (!sessao || !sessao.novaViatura) {
        console.error('Sessão inválida para cadastro de viatura.');
        if (sessao) {
            bot.sendMessage(sessao.chatId, '❌ Erro: Sessão de cadastro de viatura inválida.');
        }
        await stateManager.deleteSession(userId);
        return;
    }
    const viatura = sessao.novaViatura;

    try {
        const prefixoExists = await db.checkPrefixoExistsDB(viatura.prefixo);
        if (prefixoExists) {
            bot.sendMessage(sessao.chatId, `❌ *ERRO: Prefixo ${viatura.prefixo} já existe!*\n\nTente novamente com outro prefixo. Use /addviatura para recomeçar.`, { parse_mode: 'Markdown' });
            await stateManager.deleteSession(userId);
            return;
        }

        await db.insertViaturaDB(viatura);

        bot.sendMessage(sessao.chatId, `
✅ *VIATURA CADASTRADA COM SUCESSO!*

📋 *Dados cadastrados:*
- Prefixo: ${viatura.prefixo}
- Nome: ${viatura.nome}
- Modelo: ${viatura.modelo}
- Placa: ${viatura.placa}
- KM Atual: ${parseInt(viatura.km).toLocaleString('pt-BR')}
- Status: ${STATUS_VIATURAS[viatura.status]}

A viatura foi adicionada ao sistema e já está disponível para uso.
        `, { parse_mode: 'Markdown' });

    } catch (error) {
        console.error('Erro ao cadastrar viatura:', error);
        bot.sendMessage(sessao.chatId, '❌ Erro ao cadastrar viatura no banco de dados.');
    } finally {
        await stateManager.deleteSession(userId);
    }
}

async function processarEntradaPrefixoViatura(bot, userId, texto) {
    const sessao = await stateManager.getSession(userId);
    if (!sessao || sessao.etapa !== 'aguardando_prefixo') return false;

    if (!texto || texto.trim().length < 3) {
        bot.sendMessage(sessao.chatId, `❌ *PREFIXO INVÁLIDO*\nO prefixo deve ter pelo menos 3 caracteres.\nExemplo: VTR006, MOTO01, etc.\n\nDigite novamente:`, { parse_mode: 'Markdown' });
        return true;
    }
    
    sessao.novaViatura.prefixo = texto.trim().toUpperCase();
    sessao.etapa = 'aguardando_nome_viatura';
    await stateManager.setSession(userId, sessao);
    
    bot.sendMessage(sessao.chatId, `✅ *Prefixo salvo:* ${sessao.novaViatura.prefixo}\n\n📝 *Etapa 2/6: NOME*\n\nDigite o nome/descrição da viatura (ex: Viatura 006 - Patrulha):`, { parse_mode: 'Markdown' });
    return true;
}

async function processarEntradaNomeViatura(bot, userId, texto) {
    const sessao = await stateManager.getSession(userId);
    if (!sessao || sessao.etapa !== 'aguardando_nome_viatura') return false;

    if (!texto || texto.trim().length < 5) {
        bot.sendMessage(sessao.chatId, `❌ *NOME MUITO CURTO*\nO nome deve ter pelo menos 5 caracteres.\nExemplo: Viatura 006 - Patrulha\n\nDigite novamente:`, { parse_mode: 'Markdown' });
        return true;
    }
    
    sessao.novaViatura.nome = texto.trim();
    sessao.etapa = 'aguardando_modelo';
    await stateManager.setSession(userId, sessao);
    
    bot.sendMessage(sessao.chatId, `✅ *Nome salvo:* ${sessao.novaViatura.nome}\n\n📝 *Etapa 3/6: MODELO*\n\nDigite o modelo da viatura (ex: Ford Ka Sedan, Chevrolet Onix):`, { parse_mode: 'Markdown' });
    return true;
}

async function processarEntradaModeloViatura(bot, userId, texto) {
    const sessao = await stateManager.getSession(userId);
    if (!sessao || sessao.etapa !== 'aguardando_modelo') return false;

    if (!texto || texto.trim().length < 3) {
        bot.sendMessage(sessao.chatId, `❌ *MODELO INVÁLIDO*\nDigite o modelo da viatura.\nExemplo: Ford Ka, Chevrolet Onix, Honda Civic\n\nDigite novamente:`, { parse_mode: 'Markdown' });
        return true;
    }
    
    sessao.novaViatura.modelo = texto.trim();
    sessao.etapa = 'aguardando_placa';
    await stateManager.setSession(userId, sessao);
    
    bot.sendMessage(sessao.chatId, `✅ *Modelo salvo:* ${sessao.novaViatura.modelo}\n\n📝 *Etapa 4/6: PLACA*\n\nDigite a placa da viatura (ex: ABC-1234):`, { parse_mode: 'Markdown' });
    return true;
}

async function processarEntradaPlacaViatura(bot, userId, texto) {
    const sessao = await stateManager.getSession(userId);
    if (!sessao || sessao.etapa !== 'aguardando_placa') return false;

    const regexPlaca = /^[A-Z]{3}-?\d{4}$/i;
    if (!regexPlaca.test(texto.trim())) {
        bot.sendMessage(sessao.chatId, `❌ *FORMATO DE PLACA INVÁLIDO*\nUse o formato: ABC-1234 ou ABC1234\nExemplo: DEF-5678\n\nDigite novamente:`, { parse_mode: 'Markdown' });
        return true;
    }
    
    let placa = texto.trim().toUpperCase();
    if (!placa.includes('-') && placa.length === 7) {
        placa = placa.slice(0, 3) + '-' + placa.slice(3);
    }
    
    sessao.novaViatura.placa = placa;
    sessao.etapa = 'aguardando_km';
    await stateManager.setSession(userId, sessao);
    
    bot.sendMessage(sessao.chatId, `✅ *Placa salva:* ${placa}\n\n📝 *Etapa 5/6: QUILOMETRAGEM*\n\nDigite a quilometragem atual da viatura (apenas números):`, { parse_mode: 'Markdown' });
    return true;
}

async function processarEntradaKmViatura(bot, userId, texto) {
    const sessao = await stateManager.getSession(userId);
    if (!sessao || sessao.etapa !== 'aguardando_km') return false;

    const km = parseInt(texto.trim());
    if (isNaN(km) || km < 0) {
        bot.sendMessage(sessao.chatId, `❌ *QUILOMETRAGEM INVÁLIDA*\nDigite apenas números (sem pontos ou vírgulas).\nExemplo: 45000\n\nDigite novamente:`, { parse_mode: 'Markdown' });
        return true;
    }
    
    sessao.novaViatura.km = km;
    sessao.etapa = 'aguardando_status';
    await stateManager.setSession(userId, sessao);

    const keyboard = {
        inline_keyboard: [
            [{ text: STATUS_VIATURAS['disponivel'], callback_data: `status_viatura_disponivel_${userId}` }],
            [{ text: STATUS_VIATURAS['cedida'], callback_data: `status_viatura_cedida_${userId}` }],
            [{ text: STATUS_VIATURAS['baixada'], callback_data: `status_viatura_baixada_${userId}` }],
            [{ text: STATUS_VIATURAS['disposicao'], callback_data: `status_viatura_disposicao_${userId}` }],
            [{ text: STATUS_VIATURAS['manutencao'], callback_data: `status_viatura_manutencao_${userId}` }],
            [{ text: STATUS_VIATURAS['em_uso'], callback_data: `status_viatura_em_uso_${userId}` }],
            [{ text: STATUS_VIATURAS['reservada'], callback_data: `status_viatura_reservada_${userId}` }]
        ]
    };
    
    bot.sendMessage(sessao.chatId, `✅ *KM salva:* ${km.toLocaleString('pt-BR')}\n\n📝 *Etapa 6/6: STATUS INICIAL*\n\nSelecione o status inicial da viatura:`, { parse_mode: 'Markdown', reply_markup: keyboard });
    return true;
}

async function handleStatusViaturaCallback(bot, callbackQuery, statusViatura) {
    const userId = callbackQuery.from.id;
    const sessao = await stateManager.getSession(userId);
    
    if (!sessao || !sessao.novaViatura) {
        bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Sessão expirada ou inválida.' });
        return;
    }
    
    // Validar se o status é válido
    if (!STATUS_VIATURAS[statusViatura]) {
        bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Status inválido!' });
        return;
    }
    
    sessao.novaViatura.status = statusViatura;
    await stateManager.setSession(userId, sessao);

    bot.editMessageText(`
✅ *STATUS SELECIONADO*

Status: ${STATUS_VIATURAS[statusViatura]}

Processando cadastro da viatura...
    `, {
        chat_id: callbackQuery.message.chat.id,
        message_id: callbackQuery.message.message_id,
        parse_mode: 'Markdown'
    });

    await processarCadastroViatura(bot, userId);
    bot.answerCallbackQuery(callbackQuery.id, { text: `✅ Status ${STATUS_VIATURAS[statusViatura]} selecionado!` });
}

module.exports = {
    processarCadastroViatura,
    processarEntradaPrefixoViatura,
    processarEntradaNomeViatura,
    processarEntradaModeloViatura,
    processarEntradaPlacaViatura,
    processarEntradaKmViatura,
    handleStatusViaturaCallback
};