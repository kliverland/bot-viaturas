const db = require('../db');
const { formatarDataHora, validarAntecedencia, escapeMarkdown } = require('../utils');
const authService = require('./authService');
const stateManager = require('../stateManager');

const statusLabelsVistoriador = {
    aguardando_autorizacao: 'Aguardando autorização',
    autorizada: 'Autorizada',
    entregue: 'Chaves entregues',
    em_uso: 'Em uso',
    finalizada: 'Finalizada'
};

function montarMensagemVistoriador(solicitacao) {
    let texto = `🛠️ *ACOMPANHAMENTO - ${escapeMarkdown(solicitacao.codigo)}*\n`;
    texto += `*Status:* ${statusLabelsVistoriador[solicitacao.status] || solicitacao.status}\n`;
    if (solicitacao.viatura) {
        texto += `• Viatura: ${escapeMarkdown(solicitacao.viatura.prefixo)}\n`;
    }
    if (solicitacao.radioOperador) {
        texto += `• Chaves entregues por: ${escapeMarkdown(solicitacao.radioOperador.nome)}\n`;
    }
    if (typeof solicitacao.kmInicial !== 'undefined') {
        texto += `• KM inicial: ${solicitacao.kmInicial.toLocaleString('pt-BR')}\n`;
    }
    if (typeof solicitacao.kmFinal !== 'undefined') {
        texto += `• KM final: ${solicitacao.kmFinal.toLocaleString('pt-BR')}\n`;
    }
    return texto.trim();
}

async function atualizarMensagemVistoriador(bot, solicitacao) {
    if (!solicitacao.messageIds || !solicitacao.messageIds.vistoriadorAtendente) return;
    const { chatId, messageId } = solicitacao.messageIds.vistoriadorAtendente;
    const texto = montarMensagemVistoriador(solicitacao);
    try {
        await bot.editMessageText(texto, { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' });
    } catch (e) {
        console.error('Erro ao atualizar mensagem do vistoriador:', e.message);
    }
}

function processarHora(input) {
    if (!input) return null;
    const textoLimpo = input.trim();
    const regexHoraMinuto = /^(\d{1,2}):(\d{2})$/;
    let match = textoLimpo.match(regexHoraMinuto);
    if (match) return { hora: parseInt(match[1]), minuto: parseInt(match[2]) };
    const regexHora = /^(\d{1,2})h(\d{2})$/i;
    match = textoLimpo.match(regexHora);
    if (match) return { hora: parseInt(match[1]), minuto: parseInt(match[2]) };
    const regexInteiro = /^(\d{3,4})$/;
    match = textoLimpo.match(regexInteiro);
    if (match) {
        const numero = match[1];
        let hora, minuto;
        if (numero.length === 3) {
            hora = parseInt(numero.substring(0, 1));
            minuto = parseInt(numero.substring(1, 3));
        } else {
            hora = parseInt(numero.substring(0, 2));
            minuto = parseInt(numero.substring(2, 4));
        }
        return { hora, minuto };
    }
    return null;
}

async function solicitarData(bot, userId) {
    const sessao = await stateManager.getSession(userId);
    if (!sessao || !sessao.interactiveMessageId) return;
    sessao.etapa = 'aguardando_data';
    await stateManager.setSession(userId, sessao);
    const keyboard = { inline_keyboard: [[{ text: '📅 HOJE', callback_data: `data_hoje_${userId}` }]] };
    await bot.editMessageText(
        `📅 *ETAPA 1/3: DATA DA MISSÃO*\n\n` +
        `Por favor, informe a data que você precisará da viatura.\n` +
        `*Formato:* DD/MM/AAAA (ex: ${new Date().toLocaleDateString('pt-BR')})\n\n` +
        `*Lembrete:* Antecedência mínima de ${require('../config').ANTECEDENCIA_MINIMA_MINUTOS} minutos.`,
        { 
            chat_id: sessao.chatId,
            message_id: sessao.interactiveMessageId,
            parse_mode: 'Markdown', 
            reply_markup: keyboard 
        }
    );
}

async function solicitarHora(bot, userId) {
    const sessao = await stateManager.getSession(userId);
    if (!sessao || !sessao.interactiveMessageId) return;
    sessao.etapa = 'aguardando_hora';
    await stateManager.setSession(userId, sessao);
    await bot.editMessageText(
        `🕐 *ETAPA 2/3: HORA DA MISSÃO*\n\n` +
        `*Data selecionada:* ${sessao.data}\n\n` +
        `Digite a hora que você precisará da viatura.\n` +
        `*Formatos aceitos:* 16:30, 09h00, 1400`,
        {
            chat_id: sessao.chatId,
            message_id: sessao.interactiveMessageId,
            parse_mode: 'Markdown'
        }
    );
}

async function solicitarMotivo(bot, userId) {
    const sessao = await stateManager.getSession(userId);
    if (!sessao || !sessao.interactiveMessageId) return;
    sessao.etapa = 'aguardando_motivo';
    await stateManager.setSession(userId, sessao);
    await bot.editMessageText(
        `📝 *ETAPA 3/3: MOTIVO DA MISSÃO*\n\n` +
        `*Data:* ${sessao.data}\n*Hora:* ${sessao.hora}\n\n` +
        `Por favor, descreva o motivo da solicitação:`,
        {
            chat_id: sessao.chatId,
            message_id: sessao.interactiveMessageId,
            parse_mode: 'Markdown'
        }
    );
}


async function processarEntradaDataSolicitacao(bot, msg) {
    const userId = msg.from.id; 
    const texto = msg.text;   
    const sessao = await stateManager.getSession(userId);
    if (!sessao || sessao.etapa !== 'aguardando_data') return false;

    try { await bot.deleteMessage(msg.chat.id, msg.message_id); } catch (e) {}

    const regexData = /^(\d{2})\/(\d{2})\/(\d{4})$/;
    const match = texto.match(regexData);

    if (!match) {
        bot.sendMessage(sessao.chatId, `❌ Formato de data inválido. Use DD/MM/AAAA.`).then(m => setTimeout(() => bot.deleteMessage(m.chat.id, m.message_id), 4000));
        return true;
    }
    
    const [, dia, mes, ano] = match;
    const dataInformada = new Date(ano, mes - 1, dia);
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    if (dataInformada < hoje) {
        bot.sendMessage(sessao.chatId, `❌ A data não pode ser no passado.`).then(m => setTimeout(() => bot.deleteMessage(m.chat.id, m.message_id), 4000));
        return true;
    }
    
    sessao.data = texto;
    await stateManager.setSession(userId, sessao);
    await solicitarHora(bot, userId);
    return true;
}

async function processarEntradaHoraSolicitacao(bot, msg) {
    const userId = msg.from.id;
    const sessao = await stateManager.getSession(userId);
    if (!sessao || sessao.etapa !== 'aguardando_hora') return false;

    try { await bot.deleteMessage(msg.chat.id, msg.message_id); } catch (e) {}

    const resultado = processarHora(msg.text);
    
    if (!resultado || resultado.hora > 23 || resultado.minuto > 59) {
        bot.sendMessage(sessao.chatId, `❌ Formato de hora inválido. Use HH:MM, HHhMM ou HHMM.`).then(m => setTimeout(() => bot.deleteMessage(m.chat.id, m.message_id), 4000));
        return true;
    }
    
    const horaFormatada = `${String(resultado.hora).padStart(2, '0')}:${String(resultado.minuto).padStart(2, '0')}`;
    sessao.hora = horaFormatada;
    
    const dataHoraNecessidadeDisplay = `${sessao.data} ${horaFormatada}`;
    if (!validarAntecedencia(dataHoraNecessidadeDisplay)) {
        bot.sendMessage(sessao.chatId, `❌ A antecedência mínima de ${require('../config').ANTECEDENCIA_MINIMA_MINUTOS} minutos não foi atendida.`).then(m => setTimeout(() => bot.deleteMessage(m.chat.id, m.message_id), 5000));
        return true;
    }

    await stateManager.setSession(userId, sessao);
    await solicitarMotivo(bot, userId);
    return true;
}

async function processarEntradaMotivoSolicitacao(bot, msg) {
    const userId = msg.from.id;
    const sessao = await stateManager.getSession(userId);
    if (!sessao || sessao.etapa !== 'aguardando_motivo') return false;
    try { await bot.deleteMessage(msg.chat.id, msg.message_id); } catch (e) {}
    if (!msg.text || msg.text.trim().length < 5) {
        bot.sendMessage(sessao.chatId, `❌ Motivo muito curto. Por favor, detalhe mais.`).then(m => setTimeout(() => bot.deleteMessage(m.chat.id, m.message_id), 4000));
        return true;
    }
    sessao.motivo = msg.text.trim();
    // Passa a sessão completa para a função final, que agora consolidará a lógica
    await processarSolicitacaoFinal(bot, userId, sessao);
    return true;
}

// *** FUNÇÃO CORRIGIDA E CONSOLIDADA ***
async function processarSolicitacaoFinal(bot, userId, sessao) {
    const idSolicitacao = stateManager.generateRequestId();
    const [dia, mes, ano] = sessao.data.split('/');
    const [hora, minuto] = sessao.hora.split(':');
    const dataHoraNecessidadeMySQL = `${ano}-${mes}-${dia} ${hora}:${minuto}:00`;
    const dataHoraNecessidadeDisplay = `${sessao.data} ${sessao.hora}`;

    const solicitacao = {
        codigo: idSolicitacao,
        solicitante: { id: userId, nome: sessao.nomeUsuario, chatId: sessao.chatId },
        dataHoraNecessidade: dataHoraNecessidadeMySQL,
        dataHoraNecessidadeDisplay: dataHoraNecessidadeDisplay,
        motivo: sessao.motivo,
        status: 'aguardando_vistoria',
        messageIds: {}, // Inicializa o objeto para armazenar IDs de mensagens
        // Mantém o ID da mensagem interativa original para editá-la uma última vez
        interactiveMessageId: sessao.interactiveMessageId 
    };

    try {
        // 1. Salva a solicitação no banco de dados
        await db.salvarSolicitacaoDB(solicitacao);

        // 2. Edita a mensagem interativa original para um estado final
        await bot.editMessageText(
            `✅ *Solicitação Enviada!*\n\n` +
            `Sua solicitação \`${escapeMarkdown(idSolicitacao)}\` foi enviada para análise. ` +
            `Uma nova mensagem com o status em tempo real aparecerá abaixo.`,
            {
                chat_id: sessao.chatId,
                message_id: solicitacao.interactiveMessageId,
                parse_mode: 'Markdown'
            }
        );

        // 3. Cria a NOVA mensagem de status, que será atualizada durante todo o processo
        const msgStatus = await bot.sendMessage(
            sessao.chatId,
            `🟡 *SOLICITAÇÃO ENVIADA - ${idSolicitacao}*\n\n` +
            `*Status: Aguardando vistoriador...*\n` +
            `_Esta mensagem será atualizada com o andamento._`,
            { parse_mode: 'Markdown' }
        );

        // 4. *** PONTO CRÍTICO DA CORREÇÃO ***
        // Armazena o ID da nova mensagem de status no objeto de estado.
        solicitacao.messageIds.solicitante = msgStatus.message_id;
        
        // 5. Salva o objeto de solicitação completo no gerenciador de estado em memória
        stateManager.setRequest(idSolicitacao, solicitacao);

        // 6. Notifica os vistoriadores
        await notificarVistoriadores(bot, idSolicitacao);

    } catch (error) {
        console.error('Erro ao processar solicitação final:', error);
        bot.sendMessage(sessao.chatId, '❌ Erro ao salvar a solicitação.');
    } finally {
        // 7. Limpa a sessão de coleta de dados do usuário
        await stateManager.deleteSession(userId);
    }
}


async function notificarVistoriadores(bot, codigoSolicitacao) {
    const solicitacao = stateManager.getRequest(codigoSolicitacao);
    if (!solicitacao) return;

    const vistoriadores = await db.getUsuariosPorTipoDB('vistoriador');
    if (vistoriadores.length === 0) {
        console.log('AVISO: Nenhum vistoriador encontrado para notificar!');
        return;
    }

    const keyboard = { inline_keyboard: [[{ text: '✅ ATENDER', callback_data: `responder_vistoria_${codigoSolicitacao}` }]] };
    const mensagem = `
🔍 *NOVA SOLICITAÇÃO - ${codigoSolicitacao}*

📋 *Detalhes:*
- Solicitante: ${escapeMarkdown(solicitacao.solicitante.nome)}
- Data/Hora necessidade: ${solicitacao.dataHoraNecessidadeDisplay || solicitacao.dataHoraNecessidade}
- Motivo: ${escapeMarkdown(solicitacao.motivo)}

⏰ Clique em ATENDER para responder esta solicitação.
    `;

    solicitacao.messageIds.vistoriadores = [];
    for (const vistoriador of vistoriadores) {
        try {
            const msgVistoriador = await bot.sendMessage(vistoriador.telegram_id, mensagem, { parse_mode: 'Markdown', reply_markup: keyboard });
            solicitacao.messageIds.vistoriadores.push({ chatId: vistoriador.telegram_id, messageId: msgVistoriador.message_id, nome: vistoriador.nome });
        } catch (error) {
            console.error(`Erro ao notificar vistoriador ${vistoriador.nome}:`, error);
        }
    }
    stateManager.setRequest(codigoSolicitacao, solicitacao);

    stateManager.setRequestTimeout(
        codigoSolicitacao, 
        () => renotificarVistoriadores(bot, codigoSolicitacao), 
        3 * 60 * 1000
    );
}

async function renotificarVistoriadores(bot, codigoSolicitacao) {
    const solicitacao = stateManager.getRequest(codigoSolicitacao);
    if (!solicitacao || solicitacao.status !== 'aguardando_vistoria') {
        stateManager.clearRequestTimeout(codigoSolicitacao);
        return;
    }
    console.log(`Re-notificando vistoriadores para ${codigoSolicitacao}`);
    const mensagem = `
⚠️ *SOLICITAÇÃO PENDENTE - ${codigoSolicitacao}*

Esta solicitação ainda aguarda vistoriador há mais de 3 minutos.
- Solicitante: ${escapeMarkdown(solicitacao.solicitante.nome)}
- Data/Hora necessidade: ${solicitacao.dataHoraNecessidadeDisplay || solicitacao.dataHoraNecessidade}
- Motivo: ${escapeMarkdown(solicitacao.motivo)}
    `;
    const vistoriadores = await db.getUsuariosPorTipoDB('vistoriador');
    for (const vistoriador of vistoriadores) {
        try {
            await bot.sendMessage(vistoriador.telegram_id, mensagem, { parse_mode: 'Markdown' });
        } catch (error) {
            console.error(`Erro ao re-notificar vistoriador ${vistoriador.nome}:`, error);
        }
    }
    stateManager.clearRequestTimeout(codigoSolicitacao);
}

// *** FUNÇÃO CORRIGIDA COM VERIFICAÇÃO ADICIONAL ***
async function processarRespostaVistoriador(bot, userId, codigoSolicitacao, message) {
    const solicitacao = stateManager.getRequest(codigoSolicitacao);
    if (!solicitacao) return 'Solicitação não encontrada.';
    if (solicitacao.status !== 'aguardando_vistoria') {
        return 'Esta solicitação já foi atendida por outro vistoriador.';
    }

    const vistoriadorInfo = await authService.verificarAutenticacao(userId);
    if (!vistoriadorInfo) return 'Erro ao obter dados do vistoriador.';

    solicitacao.status = 'em_vistoria';
    solicitacao.vistoriador = { id: userId, nome: vistoriadorInfo.nome };
    solicitacao.messageIds.vistoriadorAtendente = { chatId: message.chat.id, messageId: message.message_id };
    stateManager.setRequest(codigoSolicitacao, solicitacao);
    stateManager.clearRequestTimeout(codigoSolicitacao);

    try {
        await db.atualizarStatusSolicitacaoDB(codigoSolicitacao, 'em_vistoria', {
            vistoriador_id: userId,
            vistoriador_nome: vistoriadorInfo.nome
        });
    } catch (dbError) {
        console.error("Erro ao atualizar status para em_vistoria no DB:", dbError);
        return "Erro ao registrar atendimento da vistoria no banco de dados.";
    }

    if (solicitacao.messageIds.vistoriadores) {
        for (const msg of solicitacao.messageIds.vistoriadores) {
            try {
                if (msg.chatId !== userId) { // Não edita a mensagem de quem clicou
                    await bot.editMessageText(
                        `\n✅ *SOLICITAÇÃO ATENDIDA - ${codigoSolicitacao}*\n\nSendo atendida por: ${escapeMarkdown(solicitacao.vistoriador.nome)}\n`,
                        { chat_id: msg.chatId, message_id: msg.messageId, parse_mode: 'Markdown' }
                    );
                }
            } catch (error) {
                console.error('Erro ao atualizar mensagem do vistoriador (outro):', error.message);
            }
        }
    }

    // *** PONTO CRÍTICO DA CORREÇÃO ***
    // Tenta atualizar a mensagem de status do solicitante
    try {
        // Verifica se todas as informações necessárias existem antes de tentar a edição
        if (solicitacao.solicitante && solicitacao.solicitante.chatId && solicitacao.messageIds && solicitacao.messageIds.solicitante) {
            await bot.editMessageText(
                `
🟠 *SOLICITAÇÃO EM ANÁLISE - ${codigoSolicitacao}*

*Status: Em análise pelo vistoriador ${escapeMarkdown(solicitacao.vistoriador.nome)}...*
_Esta mensagem será atualizada com o andamento._
                `,
                { 
                    chat_id: solicitacao.solicitante.chatId, 
                    message_id: solicitacao.messageIds.solicitante, // Usa o ID correto
                    parse_mode: 'Markdown' 
                }
            );
        } else {
            // Se faltar informação, registra um erro detalhado para depuração
            console.error(`[CRITICAL] Faltam dados para atualizar a mensagem do solicitante no pedido ${codigoSolicitacao}.`);
            console.error('[DEBUG] Objeto da Solicitação:', solicitacao);
        }
    } catch (error) {
        // O erro original acontecia aqui. Agora ele será capturado e registrado.
        console.error(`Erro ao atualizar mensagem do solicitante (em vistoria) para o pedido ${codigoSolicitacao}:`, error);
    }
    
    return null; // Indica que a operação foi bem-sucedida
}


async function handleSelecionarViatura(bot, callbackQuery, codigoSolicitacao, viaturaId) {
    const userId = callbackQuery.from.id;
    const solicitacao = stateManager.getRequest(codigoSolicitacao);

    if (!solicitacao || solicitacao.status !== 'em_vistoria' || solicitacao.vistoriador.id !== userId) {
        bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Ação inválida ou não permitida.' });
        return;
    }

    let connection;
    try {
        connection = await db.pool.getConnection();
        await connection.beginTransaction();

        const [viaturaRows] = await connection.execute(
            'SELECT id, prefixo, nome, placa, status FROM viaturas WHERE id = ? FOR UPDATE',
            [viaturaId]
        );

        const viaturaSelecionada = viaturaRows.length > 0 ? viaturaRows[0] : null;

        if (!viaturaSelecionada || viaturaSelecionada.status !== 'disponivel') {
            await connection.rollback();
            bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Viatura não está mais disponível!' });
            
            const viaturasDisponiveis = await db.getViaturasDisponiveisDB();
            const keyboardRefresh = {
                inline_keyboard: viaturasDisponiveis.map(v => ([{ text: `${v.prefixo} - ${v.nome}`, callback_data: `selecionar_viatura_${codigoSolicitacao}_${v.id}` }]))
            };
            await bot.editMessageText(`⚠️ A viatura selecionada ficou indisponível. Por favor, selecione outra para a solicitação ${codigoSolicitacao}:`, {
                chat_id: callbackQuery.message.chat.id, message_id: callbackQuery.message.message_id, parse_mode: 'Markdown', reply_markup: keyboardRefresh
            });
            return;
        }

        await connection.execute('UPDATE viaturas SET status = "reservada" WHERE id = ?', [viaturaId]);

        await db.atualizarStatusSolicitacaoDB(codigoSolicitacao, 'aguardando_autorizacao', {
            viatura_prefixo: viaturaSelecionada.prefixo,
            viatura_nome: viaturaSelecionada.nome,
            viatura_placa: viaturaSelecionada.placa,
            viatura_id: viaturaSelecionada.id
        }, connection);

        await connection.commit();
        
        solicitacao.status = 'aguardando_autorizacao';
        solicitacao.viatura = {
            id: viaturaId,
            prefixo: viaturaSelecionada.prefixo,
            nome: viaturaSelecionada.nome,
            placa: viaturaSelecionada.placa
        };
        stateManager.setRequest(codigoSolicitacao, solicitacao);

        await bot.editMessageText(`📋 *VIATURA SELECIONADA - ${codigoSolicitacao}*\n\n✅ Viatura: ${escapeMarkdown(viaturaSelecionada.prefixo)}\n\nA solicitação foi enviada para autorização.`, {
            chat_id: callbackQuery.message.chat.id,
            message_id: callbackQuery.message.message_id,
            parse_mode: 'Markdown'
        });

        await bot.editMessageText(`🔵 *AGUARDANDO AUTORIZAÇÃO - ${codigoSolicitacao}*\n\n*Status: Aguardando autorização...*\n• Viatura: ${escapeMarkdown(viaturaSelecionada.prefixo)}`, {
            chat_id: solicitacao.solicitante.chatId,
            message_id: solicitacao.messageIds.solicitante,
            parse_mode: 'Markdown'
        });

        await notificarAutorizadores(bot, codigoSolicitacao);
        bot.answerCallbackQuery(callbackQuery.id, { text: '✅ Viatura selecionada!' });

    } catch (error) {
        console.error('Erro na transação de seleção de viatura:', error);
        if (connection) await connection.rollback();
        bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Erro ao processar seleção.' });
    } finally {
        if (connection) connection.release();
    }
}

// O restante do arquivo (notificarAutorizadores, processarAutorizacao, etc.) continua o mesmo...
// Cole o restante do arquivo original a partir daqui.
async function notificarAutorizadores(bot, codigoSolicitacao) {
    const solicitacao = stateManager.getRequest(codigoSolicitacao);
    if (!solicitacao || !solicitacao.viatura) return;

    const autorizadores = await db.getUsuariosPorTipoDB('autorizador');
    if (autorizadores.length === 0) {
        console.log('AVISO: Nenhum autorizador encontrado!');
        return;
    }

    const keyboard = { inline_keyboard: [
        [{ text: '✅ AUTORIZAR', callback_data: `autorizar_sol_${codigoSolicitacao}` }],
        [{ text: '❌ NÃO AUTORIZAR', callback_data: `nao_autorizar_sol_${codigoSolicitacao}` }]
    ]};
    const mensagem = `
🔐 *SOLICITAÇÃO PARA AUTORIZAÇÃO - ${codigoSolicitacao}*

📋 *Resumo da solicitação:*
- Solicitante: ${escapeMarkdown(solicitacao.solicitante.nome)}
- Data/Hora necessidade: ${solicitacao.dataHoraNecessidadeDisplay || solicitacao.dataHoraNecessidade}
- Motivo: ${escapeMarkdown(solicitacao.motivo)}
- Vistoriador: ${escapeMarkdown(solicitacao.vistoriador.nome)}
- Viatura: ${escapeMarkdown(solicitacao.viatura.prefixo)} - ${escapeMarkdown(solicitacao.viatura.nome)}
- Placa: ${escapeMarkdown(solicitacao.viatura.placa)}

Você autoriza esta solicitação?
    `;
    solicitacao.messageIds.autorizadores = [];
    for (const autorizador of autorizadores) {
        try {
            const msgAut = await bot.sendMessage(autorizador.telegram_id, mensagem, { parse_mode: 'Markdown', reply_markup: keyboard });
            solicitacao.messageIds.autorizadores.push({ chatId: autorizador.telegram_id, messageId: msgAut.message_id, nome: autorizador.nome });
        } catch (error) {
            console.error(`Erro ao notificar autorizador ${autorizador.nome}:`, error);
        }
    }
    stateManager.setRequest(codigoSolicitacao, solicitacao);
}

async function processarAutorizacao(bot, userId, codigoSolicitacao, autorizado) {
    const solicitacao = stateManager.getRequest(codigoSolicitacao);
    if (!solicitacao) return 'Solicitação não encontrada.';
    if (solicitacao.status !== 'aguardando_autorizacao') {
        return 'Esta solicitação já foi processada.';
    }

    const autorizadorInfo = await authService.verificarAutenticacao(userId);
    if (!autorizadorInfo) return 'Erro ao obter dados do autorizador.';

    solicitacao.autorizador = { id: userId, nome: autorizadorInfo.nome };
    const dbData = { autorizador_id: userId, autorizador_nome: autorizadorInfo.nome };

    if (autorizado) {
        solicitacao.status = 'autorizada';
        await db.atualizarStatusSolicitacaoDB(codigoSolicitacao, 'autorizada', dbData);

        const msgText = `
✅ *SOLICITAÇÃO AUTORIZADA - ${codigoSolicitacao}*
Autorizada por: ${escapeMarkdown(autorizadorInfo.nome)}
        `;

        if (solicitacao.messageIds.autorizadores) {
            for (const msg of solicitacao.messageIds.autorizadores) {
                try {
                    await bot.editMessageText(msgText, { chat_id: msg.chatId, message_id: msg.messageId, parse_mode: 'Markdown' });
                } catch (e) {
                    console.error("Erro edit msg autorizador (auth):", e.message);
                }
            }
        }
        try {
        await bot.editMessageText(
            `
✅ *SOLICITAÇÃO AUTORIZADA - ${codigoSolicitacao}*
*Status: AUTORIZADA!*
Aguardando entrega das chaves pelo rádio-operador.
            `,
            { chat_id: solicitacao.solicitante.chatId, message_id: solicitacao.messageIds.solicitante, parse_mode: 'Markdown' }
        );
       } catch(e) {
           console.error("Erro edit msg solicitante (auth):", e.message);
       }

       await notificarRadioOperadores(bot, codigoSolicitacao);

   } else {
       solicitacao.status = 'negada';
       await db.atualizarStatusSolicitacaoDB(codigoSolicitacao, 'negada', dbData);
       if(solicitacao.viatura && solicitacao.viatura.id) {
           try {
               await db.updateViaturaStatusDB(solicitacao.viatura.id, 'disponivel');
           } catch(e) {
               console.error("Erro ao liberar viatura (negada):", e.message);
           }
       }

       const msgTextNegada = `
❌ *SOLICITAÇÃO NÃO AUTORIZADA - ${codigoSolicitacao}*
Negada por: ${escapeMarkdown(autorizadorInfo.nome)}
       `;

       if (solicitacao.messageIds.autorizadores) {
           for (const msg of solicitacao.messageIds.autorizadores) {
               try {
                   await bot.editMessageText(msgTextNegada, { chat_id: msg.chatId, message_id: msg.messageId, parse_mode: 'Markdown' });
               } catch (e) {
                   console.error("Erro edit msg autorizador (negada):", e.message);
               }
           }
       }
       try {
           await bot.editMessageText(
               `
❌ *SOLICITAÇÃO NÃO AUTORIZADA - ${codigoSolicitacao}*
*Status: NÃO AUTORIZADA*
A viatura reservada foi liberada. Entre em contato com o autorizador para mais detalhes.
               `,
               { chat_id: solicitacao.solicitante.chatId, message_id: solicitacao.messageIds.solicitante, parse_mode: 'Markdown' }
           );
       } catch(e) {
           console.error("Erro edit msg solicitante (negada):", e.message);
       }
   }
   stateManager.setRequest(codigoSolicitacao, solicitacao);
   await atualizarMensagemVistoriador(bot, solicitacao);
   return null;
}

async function notificarRadioOperadores(bot, codigoSolicitacao) {
   const solicitacao = stateManager.getRequest(codigoSolicitacao);
   if (!solicitacao || !solicitacao.viatura || !solicitacao.autorizador) return;

   const radioOperadores = await db.getUsuariosPorTipoDB('radio_operador');
   if (radioOperadores.length === 0) {
       console.log('AVISO: Nenhum radio_operador encontrado!');
       return;
   }

   const keyboard = { inline_keyboard: [[{ text: '🔑 CHAVES ENTREGUES', callback_data: `entregar_chaves_${codigoSolicitacao}` }]] };
   const mensagem = `
🔑 *ENTREGA DE CHAVES - ${codigoSolicitacao}*

📋 *Solicitação AUTORIZADA* ✅:
- Solicitante: ${escapeMarkdown(solicitacao.solicitante.nome)}
- Viatura: ${escapeMarkdown(solicitacao.viatura.prefixo)}
- Autorizador: ${escapeMarkdown(solicitacao.autorizador.nome)}

Clique em "CHAVES ENTREGUES" após a entrega e registro em livro.
   `;
   solicitacao.messageIds.radioOperadores = [];
   for (const radioOp of radioOperadores) {
       try {
           const msgRadio = await bot.sendMessage(radioOp.telegram_id, mensagem, { parse_mode: 'Markdown', reply_markup: keyboard });
           solicitacao.messageIds.radioOperadores.push({ chatId: radioOp.telegram_id, messageId: msgRadio.message_id, nome: radioOp.nome });
       } catch (error) {
           console.error(`Erro ao notificar radio-operador ${radioOp.nome}:`, error);
       }
   }
   stateManager.setRequest(codigoSolicitacao, solicitacao);
}

async function processarEntregaChaves(bot, userId, codigoSolicitacao) {
   const solicitacao = stateManager.getRequest(codigoSolicitacao);
   if (!solicitacao) return 'Solicitação não encontrada.';
   if (solicitacao.status !== 'autorizada') {
       return 'Esta solicitação não está aguardando entrega.';
   }

   const radioOpInfo = await authService.verificarAutenticacao(userId);
   if (!radioOpInfo) return 'Erro ao obter dados do rádio-operador.';

   solicitacao.status = 'entregue';
   solicitacao.radioOperador = { id: userId, nome: radioOpInfo.nome };
   await db.atualizarStatusSolicitacaoDB(codigoSolicitacao, 'entregue', { 
       radio_operador_id: userId,
       radio_operador_nome: radioOpInfo.nome
   });

   const msgText = `
✅ *CHAVES ENTREGUES - ${codigoSolicitacao}*
Entregue por: ${escapeMarkdown(radioOpInfo.nome)}
   `;

   if (solicitacao.messageIds.radioOperadores) {
       for (const msg of solicitacao.messageIds.radioOperadores) {
           try {
               await bot.editMessageText(msgText, { chat_id: msg.chatId, message_id: msg.messageId, parse_mode: 'Markdown' });
           } catch (e) {
               console.error("Erro edit msg radioOp (entrega):", e.message);
           }
       }
   }
   
   const keyboardKmInicial = {
       inline_keyboard: [[
           { text: '📊 Informe o KM inicial', callback_data: `km_inicial_${codigoSolicitacao}_${solicitacao.solicitante.id}` }
       ]]
   };

   try {
       await bot.editMessageText(
            `
🔑 *CHAVES ENTREGUES! - ${codigoSolicitacao}*
*Status: Chaves em mãos*
📊 **AÇÃO NECESSÁRIA:** Informe a quilometragem **inicial** da viatura.
            `,
            {
            chat_id: solicitacao.solicitante.chatId,
            message_id: solicitacao.messageIds.solicitante,
            parse_mode: 'Markdown',
            reply_markup: keyboardKmInicial
            }
        );
   } catch(e) {
       console.error("Erro edit msg solicitante (entrega):", e.message);
   }

    stateManager.setRequest(codigoSolicitacao, solicitacao);
    await atualizarMensagemVistoriador(bot, solicitacao);
    return null;
}

async function solicitarKmInicial(bot, message, userId, codigoSolicitacao) {
    // A assinatura da função mudou para receber o objeto 'message' completo
    const chatId = message.chat.id;

    // Garante que a sessão existe para armazenar o promptMessageId
    let sessao = await stateManager.getSession(userId);
    if (!sessao) {
        await stateManager.setSession(userId, {});
        sessao = await stateManager.getSession(userId);
    }
    
    sessao.etapa = 'aguardando_km_inicial';
    sessao.chatId = chatId;
    sessao.codigoSolicitacao = codigoSolicitacao;

    // CORREÇÃO: Troca 'bot.sendMessage' por 'bot.editMessageText'
    // para modificar a mensagem existente em vez de criar uma nova.
    await bot.editMessageText(
        `📊 *INFORMAR KM INICIAL - ${codigoSolicitacao}*\n\n` +
        `Digite a quilometragem **inicial** da viatura (apenas números):`, 
        { 
            chat_id: chatId,
            message_id: message.message_id, // Usa o ID da mensagem que continha o botão
            parse_mode: 'Markdown'
            // O reply_markup (teclado) é removido automaticamente na edição
        }
    );

// Salva o ID da mensagem que acabamos de editar.
    // Isso é crucial para que, em caso de erro de digitação do usuário,
    // o bot possa editar a mesma mensagem novamente com a instrução de correção.
    sessao.promptMessageId = message.message_id;
    await stateManager.setSession(userId, sessao);
}

async function processarEntradaKmInicial(bot, msg) {
    const userId = msg.from.id;
    const texto = msg.text;
    const sessao = await stateManager.getSession(userId);

    if (!sessao || sessao.etapa !== 'aguardando_km_inicial') return false;

    try { await bot.deleteMessage(msg.chat.id, msg.message_id); } catch (e) {}

    const km = parseInt(texto.trim());
    if (isNaN(km) || km < 0) {
        await bot.editMessageText(
            `❌ *KM INVÁLIDO*. Digite apenas números.\n\n` +
            `Digite novamente o KM **inicial**:`,
            {
                chat_id: sessao.chatId,
                message_id: sessao.promptMessageId,
                parse_mode: 'Markdown'
            }
        );
        return true;
    }

    try {
        const solicitacao = stateManager.getRequest(sessao.codigoSolicitacao);
        const viatura = await db.getViaturaPorId(solicitacao.viatura.id);

        if (km < viatura.km_atual) {
            await bot.editMessageText(
                `❌ *KM INICIAL INVÁLIDO*\n` +
                `O KM inicial (${km.toLocaleString('pt-BR')}) não pode ser menor que o KM atual da viatura (${viatura.km_atual.toLocaleString('pt-BR')}).\n\n` +
                `Digite novamente o KM **inicial**:`,
                {
                    chat_id: sessao.chatId,
                    message_id: sessao.promptMessageId,
                    parse_mode: 'Markdown'
                }
            );
            return true;
        }

        await db.registrarKmInicial(sessao.codigoSolicitacao, km, solicitacao.viatura.id);
        await db.updateViaturaStatusDB(solicitacao.viatura.id, 'em_uso');
        solicitacao.status = 'em_uso';
        solicitacao.kmInicial = km;
        
        // Atualiza a mensagem principal do solicitante
        await bot.editMessageText(
            `
🚨 *VIATURA EM USO - ${sessao.codigoSolicitacao}*
*Status: Missão em andamento...*
• KM Inicial: ${km.toLocaleString('pt-BR')}
Ao final da missão, informe o KM final para concluir.
            `,
            {
                chat_id: solicitacao.solicitante.chatId,
                message_id: solicitacao.messageIds.solicitante,
                parse_mode: 'Markdown'
            }
        );

        await bot.editMessageText(
            `✅ *KM inicial registrado: ${km.toLocaleString('pt-BR')}*\n\n` +
            `Agora, ao final da missão, digite a quilometragem **final** da viatura:`,
            {
                chat_id: sessao.chatId,
                message_id: sessao.promptMessageId,
                parse_mode: 'Markdown'
            }
        );

        sessao.etapa = 'aguardando_km_final';
        await stateManager.setSession(userId, sessao);
        stateManager.setRequest(sessao.codigoSolicitacao, solicitacao);
        await atualizarMensagemVistoriador(bot, solicitacao);
        return true;

    } catch (error) {
        console.error('Erro ao salvar KM inicial:', error);
        await bot.editMessageText('❌ Erro ao salvar KM inicial. Tente novamente.', {
            chat_id: sessao.chatId,
            message_id: sessao.promptMessageId
        });
        return true;
    }
}

async function processarEntradaKmFinal(bot, msg) {
    const userId = msg.from.id;
    const texto = msg.text;
    const sessao = await stateManager.getSession(userId);

    if (!sessao || sessao.etapa !== 'aguardando_km_final') return false;

    try { await bot.deleteMessage(msg.chat.id, msg.message_id); } catch (e) {}

    const kmFinal = parseInt(texto.trim());
    if (isNaN(kmFinal) || kmFinal < 0) {
        await bot.editMessageText(
            `❌ *KM FINAL INVÁLIDO*. Digite apenas números.\n\n` +
            `Digite novamente o KM **final**:`,
            {
                chat_id: sessao.chatId,
                message_id: sessao.promptMessageId,
                parse_mode: 'Markdown'
            }
        );
        return true;
    }

    try {
        const kmInicialDB = await db.getKmInicialSolicitacao(sessao.codigoSolicitacao);
        if (kmFinal < kmInicialDB) {
            await bot.editMessageText(
                `❌ *KM FINAL INVÁLIDO*\n`+
                `O KM final (${kmFinal.toLocaleString('pt-BR')}) não pode ser menor que o KM inicial (${kmInicialDB.toLocaleString('pt-BR')}).\n\n` +
                `Digite novamente o KM **final**:`,
                {
                    chat_id: sessao.chatId,
                    message_id: sessao.promptMessageId,
                    parse_mode: 'Markdown'
                }
            );
            return true;
        }

        const solicitacao = stateManager.getRequest(sessao.codigoSolicitacao);
        await db.registrarKmFinal(sessao.codigoSolicitacao, kmFinal, solicitacao.viatura.id);
        await db.updateViaturaStatusDB(solicitacao.viatura.id, 'disponivel');
        solicitacao.status = 'finalizada';
        solicitacao.kmFinal = kmFinal;
        
        const dadosCompletos = await db.getSolicitacaoCompleta(sessao.codigoSolicitacao);
        const kmRodados = kmFinal - kmInicialDB;

        const resumoFinalText = `
            📋 *RESUMO FINAL DA SOLICITAÇÃO*
            ═══════════════════════════════
            🆔 **Código:** ${escapeMarkdown(dadosCompletos.codigo_solicitacao)}
            👤 **Solicitante:** ${escapeMarkdown(dadosCompletos.solicitante_nome)}
            🚗 **Viatura:** ${escapeMarkdown(dadosCompletos.viatura_prefixo)}
            ---
            📊 **QUILOMETRAGEM:**
            • Inicial: ${kmInicialDB.toLocaleString('pt-BR')} km
            • Final: ${kmFinal.toLocaleString('pt-BR')} km
            • Rodados: *${kmRodados.toLocaleString('pt-BR')} km*
            ---
            📝 **MOTIVO:**
            ${escapeMarkdown(dadosCompletos.motivo || 'N/I')}
            ═══════════════════════════════
            🏁 **SOLICITAÇÃO FINALIZADA** 🏁
        `;
        
        // Esta chamada agora funcionará, pois a mensagem não foi deletada.
        await bot.editMessageText(resumoFinalText, {
            chat_id: sessao.chatId,
            message_id: solicitacao.messageIds.solicitante, // Edita a mensagem de status principal
            parse_mode: 'Markdown'
        });

        stateManager.setRequest(sessao.codigoSolicitacao, solicitacao);
        await atualizarMensagemVistoriador(bot, solicitacao);

        await stateManager.deleteSession(userId);
        stateManager.deleteRequest(sessao.codigoSolicitacao);
        return true;

    } catch (error) {
        console.error('Erro ao salvar KM final:', error);
        bot.sendMessage(sessao.chatId, '❌ Erro ao finalizar a solicitação.');
        return true;
    }
}

module.exports = {
    solicitarData,
    solicitarHora,
    solicitarMotivo,
    processarEntradaDataSolicitacao,
    processarEntradaHoraSolicitacao,
    processarEntradaMotivoSolicitacao,
    processarSolicitacaoFinal,
    notificarVistoriadores,
    renotificarVistoriadores,
    notificarAutorizadores,
    notificarRadioOperadores,
    processarRespostaVistoriador,
    handleSelecionarViatura,
    processarAutorizacao,
    processarEntregaChaves,
    solicitarKmInicial,
    processarEntradaKmInicial,
    processarEntradaKmFinal
};