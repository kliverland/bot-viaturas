// services/statusService.js
'use strict';
const db = require('../db');
const { STATUS_VIATURAS } = require('../config');
const { formatarDataHora } = require('../utils');
const authService = require('./authService'); // ← MOVIDO PARA O TOPO
const { temPermissao } = require('../utils');
const CHUNK_SIZE = 5; // Quantidade de botões por linha no teclado inline

async function listarViaturasParaAtualizacao(bot, chatId, userId) {
    try {
        const rows = await db.getTodasViaturasDB();
        
        if (rows.length === 0) {
            bot.sendMessage(chatId, '📋 Não há viaturas cadastradas no sistema.');
            return;
        }
        
        let mensagem = '*🔄 ATUALIZAR STATUS DE VIATURA*\n\n';
        mensagem += '*Selecione a viatura que deseja atualizar:*\n\n';
        
        rows.forEach((viatura, index) => {
            mensagem += `${index + 1}. ${STATUS_VIATURAS[viatura.status] || '⚪ Status Desconhecido'} *${viatura.prefixo}* - ${viatura.nome}\n`;
        });
        
        const keyboard = {
            inline_keyboard: []
        };
        
        for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
            const linha = [];
            for (let j = i; j < Math.min(i + CHUNK_SIZE, rows.length); j++) {
                linha.push({
                    text: `${j + 1}`,
                    callback_data: `select_viatura_${rows[j].id}_${j + 1}_${userId}`
                });
            }
            keyboard.inline_keyboard.push(linha);
        }
        
        bot.sendMessage(chatId, mensagem, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
        
    } catch (error) {
        console.error('Erro ao listar viaturas para atualização:', error);
        bot.sendMessage(chatId, '❌ Erro ao consultar viaturas.');
    }
}

async function mostrarOpcoesStatus(bot, callbackQuery, viaturaId, numeroViatura) {
    try {
        const viatura = await db.getViaturaPorId(viaturaId);
        
        if (!viatura) {
            bot.answerCallbackQuery(callbackQuery.id, {text: '❌ Viatura não encontrada!'});
            return;
        }
        
        const userId = callbackQuery.from.id;
        
        // Verificar se usuário tem permissão (vistoriador ou superior)
        const usuario = await authService.verificarAutenticacao(userId);
        if (!usuario) {
            bot.answerCallbackQuery(callbackQuery.id, {text: '❌ Usuário não autenticado!'});
            return;
        }
        
        if (!temPermissao(usuario.tipo_usuario, 'vistoriador')) {
            bot.answerCallbackQuery(callbackQuery.id, {text: '❌ Sem permissão para alterar status!'});
            return;
        }
        
        const statusKeyboard = {
            inline_keyboard: [
                [{text: '✅ Disponível', callback_data: `change_status_${viaturaId}_disponivel_${userId}`}],
                [{text: '🚗 Cedida', callback_data: `change_status_${viaturaId}_cedida_${userId}`}],
                [{text: '❌ Baixada', callback_data: `change_status_${viaturaId}_baixada_${userId}`}],
                [{text: '🔄 À Disposição', callback_data: `change_status_${viaturaId}_disposicao_${userId}`}],
                [{text: '🔧 Em Manutenção', callback_data: `change_status_${viaturaId}_manutencao_${userId}`}],
                [{text: '🔒 Reservada', callback_data: `change_status_${viaturaId}_reservada_${userId}`}]
            ]
        };
        
        bot.editMessageText(`🔄 *ALTERAR STATUS DA VIATURA ${numeroViatura}*

*Viatura:* ${viatura.prefixo} - ${viatura.nome}
*Status atual:* ${STATUS_VIATURAS[viatura.status] || 'Status Desconhecido'}

*Para qual status você deseja alterar?*
        `, {
            chat_id: callbackQuery.message.chat.id,
            message_id: callbackQuery.message.message_id,
            parse_mode: 'Markdown',
            reply_markup: statusKeyboard
        });
        
        bot.answerCallbackQuery(callbackQuery.id, {text: `Viatura ${numeroViatura} selecionada`});
        
    } catch (error) {
        console.error('Erro ao mostrar opções de status:', error);
        bot.answerCallbackQuery(callbackQuery.id, {text: '❌ Erro interno.'});
    }
}

async function alterarStatusViatura(bot, callbackQuery, viaturaId, novoStatus) {
    // Sanitização dos parâmetros recebidos
    viaturaId = parseInt(viaturaId, 10);
    if (Number.isNaN(viaturaId)) {
        bot.answerCallbackQuery(callbackQuery.id, {text: '❌ ID de viatura inválido!'});
        return;
    }
    if (!Object.prototype.hasOwnProperty.call(STATUS_VIATURAS, novoStatus)) {
        bot.answerCallbackQuery(callbackQuery.id, {text: '❌ Status inválido!'});
        return;
    }
    try {
        const viatura = await db.getViaturaPorId(viaturaId);
        
        if (!viatura) {
            bot.answerCallbackQuery(callbackQuery.id, {text: '❌ Viatura não encontrada!'});
            return;
        }
        
        const usuario = await authService.verificarAutenticacao(callbackQuery.from.id);
        if (!usuario) {
            bot.answerCallbackQuery(callbackQuery.id, {text: '❌ Usuário não autenticado!'});
            return;
        }
        
        // Verificar permissão novamente
        if (!temPermissao(usuario.tipo_usuario, 'vistoriador')) {
            bot.answerCallbackQuery(callbackQuery.id, {text: '❌ Sem permissão para alterar status!'});
            return;
        }
        
        const statusAnterior = viatura.status;
        
        if (statusAnterior === novoStatus) {
            bot.answerCallbackQuery(callbackQuery.id, {text: '⚠️ Viatura já está neste status!'});
            return;
        }
        
        const sucesso = await db.updateViaturaStatusDB(viaturaId, novoStatus);
        if (!sucesso) {
            bot.answerCallbackQuery(callbackQuery.id, {text: '❌ Nenhuma linha alterada. O status pode ter sido modificado por outro usuário.'});
            return;
        }
        
        bot.editMessageText(`✅ *STATUS ALTERADO COM SUCESSO!*

*Viatura:* ${viatura.prefixo} - ${viatura.nome}
*Status anterior:* ${STATUS_VIATURAS[statusAnterior]}
*Novo status:* ${STATUS_VIATURAS[novoStatus]}

*Alterado por:* ${usuario.nome}
*Data/Hora:* ${formatarDataHora()}

A viatura agora está ${STATUS_VIATURAS[novoStatus].toLowerCase()}.
        `, {
            chat_id: callbackQuery.message.chat.id,
            message_id: callbackQuery.message.message_id,
            parse_mode: 'Markdown'
        });
        
        bot.answerCallbackQuery(callbackQuery.id, {text: '✅ Status alterado com sucesso!'});
        
        // Log da alteração
        console.log(`[${formatarDataHora()}] Status da viatura ${viatura.prefixo} alterado de '${statusAnterior}' para '${novoStatus}' por ${usuario.nome} (ID: ${callbackQuery.from.id})`);
        
    } catch (error) {
        console.error('Erro ao alterar status da viatura:', error);
        bot.answerCallbackQuery(callbackQuery.id, {text: '❌ Erro interno ao alterar status.'});
    }
}

module.exports = {
    listarViaturasParaAtualizacao,
    mostrarOpcoesStatus,
    alterarStatusViatura
};
