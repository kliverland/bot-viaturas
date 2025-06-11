// services/requestService.js
const db = require('../db');
const utils = require('../utils');
const authService = require('./authService');
const stateManager = require('../stateManager');

async function solicitarData(bot, chatId, userId) {
    const sessao = await stateManager.getSession(userId) || {};
    sessao.etapa = 'aguardando_data';
    sessao.chatId = chatId;
    await stateManager.setSession(userId, sessao);

    const keyboard = {
        inline_keyboard: [
            [{ text: '📅 HOJE', callback_data: `data_hoje_${userId}` }]
        ]
    };
    bot.sendMessage(chatId, `
📅 *INFORMAR DATA*

Por favor, informe a data que você precisará da viatura.
⏰ *IMPORTANTE: Solicitação deve ser feita com pelo menos ${require('../config').ANTECEDENCIA_MINIMA_MINUTOS} minutos de antecedência!*

*Formato:* DD/MM/AAAA
*Exemplo:* 15/06/2025

Digite a data desejada ou clique em "HOJE":
    `, { parse_mode: 'Markdown', reply_markup: keyboard });
}

async function solicitarHora(bot, chatId, userId) {
    const sessao = await stateManager.getSession(userId);
    if (!sessao || !sessao.data) {
        bot.sendMessage(chatId, "❌ Erro: Data não definida. Por favor, comece a solicitação novamente com /solicitarviatura.");
        await stateManager.deleteSession(userId);
        return;
    }
    sessao.etapa = 'aguardando_hora';
    await stateManager.setSession(userId, sessao);

    bot.sendMessage(chatId, `
🕐 *INFORMAR HORA*

Data selecionada: ${sessao.data}
Digite a hora que você precisará da viatura:

*Ex.: 16h00, 10:30, 0930*

Digite a hora desejada:
    `, { parse_mode: 'Markdown' });
}

async function solicitarMotivo(bot, chatId, userId) {
    const sessao = await stateManager.getSession(userId);
    if (!sessao || !sessao.data || !sessao.hora) {
        bot.sendMessage(chatId, "❌ Erro: Data ou Hora não definida. Por favor, comece a solicitação novamente com /solicitarviatura.");
        await stateManager.deleteSession(userId);
        return;
    }
    sessao.etapa = 'aguardando_motivo';
    await stateManager.setSession(userId, sessao);

    bot.sendMessage(chatId, `
📝 *INFORMAR MOTIVO*

Data: ${sessao.data}
Hora: ${sessao.hora}
Por favor, descreva o motivo pelo qual você precisa da viatura:

*Exemplos:*
- Patrulhamento preventivo
- Atendimento de ocorrência
- Deslocamento administrativo
- Curso/treinamento

Digite o motivo:
    `, { parse_mode: 'Markdown' });
}

async function processarEntradaDataSolicitacao(bot, userId, texto) {
    const sessao = await stateManager.getSession(userId);
    if (!sessao || sessao.etapa !== 'aguardando_data') return false;

    const regexData = /^(\d{2})\/(\d{2})\/(\d{4})$/;
    const match = texto.match(regexData);

    if (!match) {
        bot.sendMessage(sessao.chatId, `❌ *FORMATO INVÁLIDO*\nPor favor, use o formato: DD/MM/AAAA\nExemplo: 15/06/2025\n\nDigite novamente ou clique em "HOJE":`, { parse_mode: 'Markdown' });
        return true;
    }
    const [, dia, mes, ano] = match;
    const dataInformada = new Date(ano, mes - 1, dia);
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    if (dataInformada < hoje) {
        bot.sendMessage(sessao.chatId, `❌ *DATA INVÁLIDA*\nA data informada deve ser hoje ou uma data futura.\nData atual: ${new Date().toLocaleDateString('pt-BR')}\n\nDigite uma data válida ou clique em "HOJE":`, { parse_mode: 'Markdown' });
        return true;
    }
    sessao.data = texto;
    await stateManager.setSession(userId, sessao);
    bot.sendMessage(sessao.chatId, `✅ *Data salva:* ${texto}`, { parse_mode: 'Markdown' });
    solicitarHora(bot, sessao.chatId, userId);
    return true;
}

async function processarEntradaHoraSolicitacao(bot, userId, texto) {
    const sessao = await stateManager.getSession(userId);
    if (!sessao || sessao.etapa !== 'aguardando_hora') return false;

    function processarHora(input) {
        const textoLimpo = input.trim();
        
        const regexHoraMinuto = /^(\d{1,2}):(\d{2})$/;
        let match = textoLimpo.match(regexHoraMinuto);
        if (match) {
            const hora = parseInt(match[1]);
            const minuto = parseInt(match[2]);
            return { hora, minuto, formato: 'HH:MM' };
        }
        
        const regexHora = /^(\d{1,2})h(\d{2})$/i;
        match = textoLimpo.match(regexHora);
        if (match) {
            const hora = parseInt(match[1]);
            const minuto = parseInt(match[2]);
            return { hora, minuto, formato: 'HHhMM' };
        }
        
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
            return { hora, minuto, formato: 'HHMM' };
        }
        
        return null;
    }

    const resultado = processarHora(texto);
    
    if (!resultado) {
        bot.sendMessage(sessao.chatId, `❌ *FORMATO INVÁLIDO*

Formatos aceitos:
- **10:00** (hora:minuto)
- **10h00** (hora h minuto)
- **1000** (número de 4 dígitos)

Digite novamente:`, { parse_mode: 'Markdown' });
        return true;
    }

    const { hora, minuto } = resultado;
    
    if (hora > 23 || minuto > 59) {
        bot.sendMessage(sessao.chatId, `❌ *HORA INVÁLIDA*

Hora deve ser entre 00:00 e 23:59
**Você digitou:** ${hora}:${String(minuto).padStart(2, '0')}

Digite novamente:`, { parse_mode: 'Markdown' });
        return true;
    }

    const horaFormatada = `${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}`;
    
    sessao.hora = horaFormatada;
    await stateManager.setSession(userId, sessao);
    bot.sendMessage(sessao.chatId, `✅ *Hora salva:* ${horaFormatada}`, { parse_mode: 'Markdown' });
    solicitarMotivo(bot, sessao.chatId, userId);
    return true;
}

async function processarEntradaMotivoSolicitacao(bot, userId, texto) {
    const sessao = await stateManager.getSession(userId);
    if (!sessao || sessao.etapa !== 'aguardando_motivo') return false;

    if (!texto || texto.trim().length < 5) {
        bot.sendMessage(sessao.chatId, `❌ *MOTIVO MUITO CURTO*\nPor favor, descreva com mais detalhes o motivo da solicitação.\nMínimo de 5 caracteres.\n\nDigite novamente:`, { parse_mode: 'Markdown' });
        return true;
    }
    sessao.motivo = texto.trim();
    await stateManager.setSession(userId, sessao);
    bot.sendMessage(sessao.chatId, `✅ *Motivo salvo:* ${texto.trim()}`, { parse_mode: 'Markdown' });
    await processarSolicitacaoFinal(bot, userId);
    return true;
}

async function processarSolicitacaoFinal(bot, userId) {
    const sessao = await stateManager.getSession(userId);
    if (!sessao || !sessao.nomeUsuario || !sessao.data || !sessao.hora || !sessao.motivo) {
        bot.sendMessage(sessao.chatId, '❌ Erro: Dados da solicitação incompletos. Tente novamente com /solicitarviatura.');
        await stateManager.deleteSession(userId);
        return;
    }

    const idSolicitacao = stateManager.generateRequestId();
    const dataInput = sessao.data;
    const horaInput = sessao.hora;

    const [dia, mes, ano] = dataInput.split('/');
    const [hora, minuto] = horaInput.split(':');
    const dataHoraNecessidadeMySQL = `${ano}-${mes}-${dia} ${hora}:${minuto}:00`;
    const dataHoraNecessidadeDisplay = `${dataInput} ${horaInput}`;

    if (!utils.validarAntecedencia(dataHoraNecessidadeDisplay)) {
        const necessidadeDate = new Date(parseInt(ano), parseInt(mes) - 1, parseInt(dia), parseInt(hora), parseInt(minuto));
        const agora = new Date();
        const diferencaMinutos = Math.round((necessidadeDate - agora) / (1000 * 60));
        const antecedenciaMinima = require('../config').ANTECEDENCIA_MINIMA_MINUTOS;

        bot.sendMessage(sessao.chatId, `
❌ *ANTECEDÊNCIA INSUFICIENTE*

Solicitações devem ser feitas com pelo menos ${antecedenciaMinima} minutos de antecedência.
- Data/Hora atual: ${utils.formatarDataHora()}
- Data/Hora solicitada: ${dataHoraNecessidadeDisplay}
- Diferença: ${diferencaMinutos} minutos

${diferencaMinutos < 0 ? '⚠️ A data/hora solicitada já passou!' : `⚠️ Faltam ${antecedenciaMinima - diferencaMinutos} minutos para atingir a antecedência mínima.`}

Por favor, escolha um horário com mais antecedência.
        `, { parse_mode: 'Markdown' });
        sessao.etapa = 'aguardando_hora';
        delete sessao.hora;
        await stateManager.setSession(userId, sessao);
        return;
    }

    const solicitacao = {
        codigo: idSolicitacao,
        solicitante: { id: userId, nome: sessao.nomeUsuario, chatId: sessao.chatId },
        dataHoraSolicitacao: utils.formatarDataHora(),
        dataHoraNecessidade: dataHoraNecessidadeMySQL,
        dataHoraNecessidadeDisplay: dataHoraNecessidadeDisplay,
        motivo: sessao.motivo,
        status: 'aguardando_vistoria',
        messageIds: {}
    };

    try {
        await db.salvarSolicitacaoDB(solicitacao);
        stateManager.setRequest(idSolicitacao, solicitacao);

        const msgSolicitante = await bot.sendMessage(sessao.chatId, `
🟡 *SOLICITAÇÃO ENVIADA - ${idSolicitacao}*

📋 *Dados da solicitação:*
- Solicitante: ${sessao.nomeUsuario}
- Data/Hora necessidade: ${dataHoraNecessidadeDisplay}
- Motivo: ${sessao.motivo}

⏳ *Status: Aguardando vistoriador...*
Você será notificado sobre o andamento.
        `, { parse_mode: 'Markdown' });
        solicitacao.messageIds.solicitante = msgSolicitante.message_id;
        stateManager.setRequest(idSolicitacao, solicitacao);

        await notificarVistoriadores(bot, idSolicitacao);
    } catch (error) {
        console.error('Erro ao processar solicitação final:', error);
        bot.sendMessage(sessao.chatId, '❌ Erro ao salvar ou notificar sobre a solicitação. Tente novamente.');
    } finally {
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
- Solicitante: ${solicitacao.solicitante.nome}
- Data/Hora necessidade: ${solicitacao.dataHoraNecessidadeDisplay || solicitacao.dataHoraNecessidade}
- Motivo: ${solicitacao.motivo}

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
- Solicitante: ${solicitacao.solicitante.nome}
- Data/Hora necessidade: ${solicitacao.dataHoraNecessidadeDisplay || solicitacao.dataHoraNecessidade}
- Motivo: ${solicitacao.motivo}
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

async function processarRespostaVistoriador(bot, userId, codigoSolicitacao) {
    const solicitacao = stateManager.getRequest(codigoSolicitacao);
    if (!solicitacao) return 'Solicitação não encontrada.';
    if (solicitacao.status !== 'aguardando_vistoria') {
        return 'Esta solicitação já foi atendida por outro vistoriador.';
    }

    const vistoriadorInfo = await authService.verificarAutenticacao(userId);
    if (!vistoriadorInfo) return 'Erro ao obter dados do vistoriador.';

    solicitacao.status = 'em_vistoria';
    solicitacao.vistoriador = { id: userId, nome: vistoriadorInfo.nome };
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
                if (msg.chatId !== userId) {
                    await bot.editMessageText(`
✅ *SOLICITAÇÃO ATENDIDA - ${codigoSolicitacao}*

Sendo atendida por: ${solicitacao.vistoriador.nome}

📋 *Detalhes:*
- Solicitante: ${solicitacao.solicitante.nome}
- Data/Hora necessidade: ${solicitacao.dataHoraNecessidadeDisplay || solicitacao.dataHoraNecessidade}
- Motivo: ${solicitacao.motivo}
                    `, { chat_id: msg.chatId, message_id: msg.messageId, parse_mode: 'Markdown' });
                }
            } catch (error) {
                console.error('Erro ao atualizar mensagem do vistoriador (outro):', error.message);
            }
        }
    }

    try {
        await bot.editMessageText(`
🟠 *SOLICITAÇÃO EM ANÁLISE - ${codigoSolicitacao}*

📋 *Dados da solicitação:*
- Solicitante: ${solicitacao.solicitante.nome}
- Data/Hora necessidade: ${solicitacao.dataHoraNecessidadeDisplay || solicitacao.dataHoraNecessidade}
- Motivo: ${solicitacao.motivo}

🔍 *Status: Em análise - Vistoriador: ${solicitacao.vistoriador.nome}*
        `, { chat_id: solicitacao.solicitante.chatId, message_id: solicitacao.messageIds.solicitante, parse_mode: 'Markdown' });
    } catch (error) {
        console.error('Erro ao atualizar mensagem do solicitante (em vistoria):', error);
    }
    return null;
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
            if (viaturasDisponiveis.length === 0) {
                await bot.editMessageText(`❌ *SEM VIATURAS DISPONÍVEIS*\n\nNão há outras viaturas disponíveis no momento.`, {
                    chat_id: callbackQuery.message.chat.id, message_id: callbackQuery.message.message_id, parse_mode: 'Markdown'
                });
            } else {
                const keyboardRefresh = {
                    inline_keyboard: viaturasDisponiveis.map(v => [{ text: `${v.prefixo} - ${v.nome}`, callback_data: `selecionar_viatura_${codigoSolicitacao}_${v.id}` }])
                };
                await bot.editMessageText(`⚠️ A viatura selecionada ficou indisponível. Por favor, selecione outra para a solicitação ${codigoSolicitacao}:`, {
                    chat_id: callbackQuery.message.chat.id, message_id: callbackQuery.message.message_id, parse_mode: 'Markdown', reply_markup: keyboardRefresh
                });
            }
            return;
        }

        await connection.execute('UPDATE viaturas SET status = "reservada" WHERE id = ?', [viaturaId]);

        await db.atualizarStatusSolicitacaoDB(codigoSolicitacao, 'aguardando_autorizacao', {
            viatura_prefixo: viaturaSelecionada.prefixo,
            viatura_nome: viaturaSelecionada.nome,
            viatura_placa: viaturaSelecionada.placa
        });

        await connection.commit();

        solicitacao.status = 'aguardando_autorizacao';
        solicitacao.viatura = {
            id: viaturaId,
            prefixo: viaturaSelecionada.prefixo,
            nome: viaturaSelecionada.nome,
            placa: viaturaSelecionada.placa
        };
        stateManager.setRequest(codigoSolicitacao, solicitacao);

        await bot.editMessageText(`📋 *VIATURA SELECIONADA - ${codigoSolicitacao}*\n\n✅ Viatura: ${viaturaSelecionada.prefixo} - ${viaturaSelecionada.nome}\n\nA solicitação foi enviada para autorização.`, {
            chat_id: callbackQuery.message.chat.id,
            message_id: callbackQuery.message.message_id,
            parse_mode: 'Markdown'
        });

        await bot.editMessageText(`🔵 *SOLICITAÇÃO AGUARDANDO AUTORIZAÇÃO - ${codigoSolicitacao}*\n\n📋 *Dados da solicitação:*\n• Solicitante: ${solicitacao.solicitante.nome}\n• Data/Hora necessidade: ${solicitacao.dataHoraNecessidadeDisplay || solicitacao.dataHoraNecessidade}\n• Motivo: ${solicitacao.motivo}\n• Vistoriador: ${solicitacao.vistoriador.nome}\n• Viatura: ${viaturaSelecionada.prefixo} - ${viaturaSelecionada.nome}\n\n🔵 *Status: Aguardando autorização...*`, {
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
- Solicitante: ${solicitacao.solicitante.nome}
- Data/Hora necessidade: ${solicitacao.dataHoraNecessidadeDisplay || solicitacao.dataHoraNecessidade}
- Motivo: ${solicitacao.motivo}
- Vistoriador: ${solicitacao.vistoriador.nome}
- Viatura: ${solicitacao.viatura.prefixo} - ${solicitacao.viatura.nome}
- Placa: ${solicitacao.viatura.placa}

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
Autorizada por: ${autorizadorInfo.nome}
📋 *Resumo da solicitação:*
- Solicitante: ${solicitacao.solicitante.nome}
- Data/Hora necessidade: ${solicitacao.dataHoraNecessidadeDisplay || solicitacao.dataHoraNecessidade}
- Viatura: ${solicitacao.viatura.prefixo} - ${solicitacao.viatura.nome}`;

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
            await bot.editMessageText(`
✅ *SOLICITAÇÃO AUTORIZADA - ${codigoSolicitacao}*
📋 *Dados da solicitação:*
- Solicitante: ${solicitacao.solicitante.nome}
- Data/Hora necessidade: ${solicitacao.dataHoraNecessidadeDisplay || solicitacao.dataHoraNecessidade}
- Viatura: ${solicitacao.viatura.prefixo} - ${solicitacao.viatura.nome}
- Autorizador: ${autorizadorInfo.nome}
🎉 *Status: AUTORIZADA! Aguardando entrega das chaves...*
       `, { chat_id: solicitacao.solicitante.chatId, message_id: solicitacao.messageIds.solicitante, parse_mode: 'Markdown' });
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
Negada por: ${autorizadorInfo.nome}
📋 *Resumo da solicitação:*
- Solicitante: ${solicitacao.solicitante.nome}
- Viatura: ${solicitacao.viatura.prefixo} - ${solicitacao.viatura.nome}`;

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
           await bot.editMessageText(`
❌ *SOLICITAÇÃO NÃO AUTORIZADA - ${codigoSolicitacao}*
📋 *Dados da solicitação:*
- Solicitante: ${solicitacao.solicitante.nome}
- Viatura: ${solicitacao.viatura.prefixo} - ${solicitacao.viatura.nome}
- Autorizador: ${autorizadorInfo.nome}
❌ *Status: NÃO AUTORIZADA*
Entre em contato com o autorizador para mais informações.
       `, { chat_id: solicitacao.solicitante.chatId, message_id: solicitacao.messageIds.solicitante, parse_mode: 'Markdown' });
       } catch(e) {
           console.error("Erro edit msg solicitante (negada):", e.message);
       }
   }
   stateManager.setRequest(codigoSolicitacao, solicitacao);
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

📋 *Resumo da solicitação *AUTORIZADA* ✅:*
- Solicitante: ${solicitacao.solicitante.nome}
- Viatura: ${solicitacao.viatura.prefixo} - ${solicitacao.viatura.nome}
- Placa: ${solicitacao.viatura.placa}
- Autorizador: ${solicitacao.autorizador.nome}

📋 *RECOMENDAÇÕES PARA ENTREGA:*
- Verificar identidade do solicitante
- Mostrar ficha DNA da viatura
- Orientar sobre vistoria prévia facultativa
- Informar sobre o termo de responsabilidade
- *EXIGIR* o correto preenchimento do livro

Clique em "CHAVES ENTREGUES" após a entrega.
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
Entregue por: ${radioOpInfo.nome}
📋 *Resumo da solicitação:*
- Solicitante: ${solicitacao.solicitante.nome}
- Viatura: ${solicitacao.viatura.prefixo} - ${solicitacao.viatura.nome}
- Rádio-operador: ${radioOpInfo.nome}
✅ *Status: CHAVES ENTREGUES*`;

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
       await bot.editMessageText(`
🎉 *CHAVES ENTREGUES - ${codigoSolicitacao}*
📋 *Dados da solicitação:*
- Solicitante: ${solicitacao.solicitante.nome}
- Viatura: ${solicitacao.viatura.prefixo} - ${solicitacao.viatura.nome}
- Rádio-operador: ${radioOpInfo.nome}

🔑 *Status: CHAVES ENTREGUES!*
📊 **Próximo passo:** Informe a quilometragem inicial da viatura.
       `, { 
           chat_id: solicitacao.solicitante.chatId, 
           message_id: solicitacao.messageIds.solicitante, 
           parse_mode: 'Markdown',
           reply_markup: keyboardKmInicial 
       });
   } catch(e) {
       console.error("Erro edit msg solicitante (entrega):", e.message);
   }

   stateManager.setRequest(codigoSolicitacao, solicitacao);
   return null;
}

async function solicitarKmInicial(bot, chatId, userId, codigoSolicitacao) {
   await stateManager.setSession(userId, {
       etapa: 'aguardando_km_inicial',
       chatId: chatId,
       codigoSolicitacao: codigoSolicitacao
   });

   bot.sendMessage(chatId, `
📊 *INFORMAR KM INICIAL - ${codigoSolicitacao}*

Digite a quilometragem **inicial** da viatura no momento da retirada:

*Exemplo:* 45000

Digite apenas números:
   `, { parse_mode: 'Markdown' });
}

async function solicitarKmFinal(bot, chatId, userId, codigoSolicitacao, kmInicial) {
   await stateManager.setSession(userId, {
       etapa: 'aguardando_km_final',
       chatId: chatId,
       codigoSolicitacao: codigoSolicitacao,
       kmInicial: kmInicial
   });

   bot.sendMessage(chatId, `
📊 *INFORMAR KM FINAL - ${codigoSolicitacao}*

KM inicial informado: **${parseInt(kmInicial).toLocaleString('pt-BR')}**

Agora digite a quilometragem **final** da viatura no momento da devolução:

*Exemplo:* 45150

Digite apenas números:
   `, { parse_mode: 'Markdown' });
}

async function processarEntradaKmInicial(bot, userId, texto) {
   const sessao = await stateManager.getSession(userId);
   if (!sessao || sessao.etapa !== 'aguardando_km_inicial') return false;

   const km = parseInt(texto.trim());
   if (isNaN(km) || km < 0) {
       bot.sendMessage(sessao.chatId, `❌ *KM INVÁLIDO*\nDigite apenas números (sem pontos ou vírgulas).\nExemplo: 45000\n\nDigite novamente:`, { parse_mode: 'Markdown' });
       return true;
   }

   try {
       const solicitacao = stateManager.getRequest(sessao.codigoSolicitacao);
       if (!solicitacao || !solicitacao.viatura) {
           bot.sendMessage(sessao.chatId, '❌ Erro: Dados da solicitação não encontrados.');
           return true;
       }

       const viatura = await db.getViaturaPorId(solicitacao.viatura.id);
       if (!viatura) {
           bot.sendMessage(sessao.chatId, '❌ Erro: Viatura não encontrada.');
           return true;
       }

       if (km < viatura.km_atual) {
           bot.sendMessage(sessao.chatId, 
               `❌ *KM INVÁLIDO*\n\nO KM inicial (${km.toLocaleString('pt-BR')}) não pode ser menor que o KM atual da viatura (${viatura.km_atual.toLocaleString('pt-BR')}).\n\nDigite novamente:`, 
               { parse_mode: 'Markdown' });
           return true;
       }

       await db.registrarKmInicial(
           sessao.codigoSolicitacao, 
           km, 
           solicitacao.viatura.id
       );

       await db.updateViaturaStatusDB(solicitacao.viatura.id, 'em_uso');
       
       const keyboardKmFinal = {
           inline_keyboard: [[
               { text: '📊 Informe o KM final', callback_data: `km_final_${sessao.codigoSolicitacao}_${userId}` }
           ]]
       };

       await bot.editMessageText(`
📊 *KM INICIAL REGISTRADO - ${sessao.codigoSolicitacao}*

✅ KM inicial: ${km.toLocaleString('pt-BR')}

Quando você **devolver** a viatura, clique no botão abaixo para informar o KM final:
       `, { 
           chat_id: sessao.chatId, 
           message_id: solicitacao.messageIds.solicitante,
           parse_mode: 'Markdown', 
           reply_markup: keyboardKmFinal 
       });

       await stateManager.deleteSession(userId);
       return true;
   } catch (error) {
       console.error('Erro ao salvar KM inicial:', error);
       bot.sendMessage(sessao.chatId, '❌ Erro ao salvar KM inicial. Tente novamente.');
       return true;
   }
}

async function processarEntradaKmFinal(bot, userId, texto) {
   const sessao = await stateManager.getSession(userId);
   if (!sessao || sessao.etapa !== 'aguardando_km_final') return false;

   const kmFinal = parseInt(texto.trim());
   if (isNaN(kmFinal) || kmFinal < 0) {
       bot.sendMessage(sessao.chatId, `❌ *KM INVÁLIDO*\nDigite apenas números (sem pontos ou vírgulas).\nExemplo: 45150\n\nDigite novamente:`, { parse_mode: 'Markdown' });
       return true;
   }

   const kmInicialDB = await db.getKmInicialSolicitacao(sessao.codigoSolicitacao);
   if (!kmInicialDB) {
       bot.sendMessage(sessao.chatId, '❌ Erro: KM inicial não encontrado. Tente novamente.');
       return true;
   }

   if (kmFinal < kmInicialDB) {
       bot.sendMessage(sessao.chatId, 
           `❌ *KM FINAL INVÁLIDO*\n\nO KM final (${kmFinal.toLocaleString('pt-BR')}) não pode ser menor que o KM inicial (${kmInicialDB.toLocaleString('pt-BR')}).\n\nDigite novamente:`, 
           { parse_mode: 'Markdown' });
       return true;
   }

   try {
       const solicitacao = stateManager.getRequest(sessao.codigoSolicitacao);
       
       await db.registrarKmFinal(
           sessao.codigoSolicitacao, 
           kmFinal, 
           solicitacao.viatura.id
       );

       await db.updateViaturaStatusDB(solicitacao.viatura.id, 'disponivel');
       
       const kmRodados = kmFinal - kmInicialDB;
       
       const dadosCompletos = await db.getSolicitacaoCompleta(sessao.codigoSolicitacao);
       const radioOperadorNome = dadosCompletos.radio_operador_nome || 'N/I';

       const dataSolicitacao = new Date(dadosCompletos.data_solicitacao).toLocaleString('pt-BR');
       const dataNecessidade = new Date(dadosCompletos.data_necessidade).toLocaleString('pt-BR');
       const dataEntrega = dadosCompletos.data_entrega ? new Date(dadosCompletos.data_entrega).toLocaleString('pt-BR') : 'N/I';

       await bot.editMessageText(`
📋 *RESUMO FINAL DA SOLICITAÇÃO*
═══════════════════════════════

🆔 **Código:** ${dadosCompletos.codigo_solicitacao}

👤 **PESSOAS ENVOLVIDAS:**
- Solicitante: ${dadosCompletos.solicitante_nome}
- Vistoriador: ${dadosCompletos.vistoriador_nome || 'N/I'}
- Autorizador: ${dadosCompletos.autorizador_nome || 'N/I'}
- Rádio-operador: ${radioOperadorNome}

🚗 **VIATURA:**
- Nome: ${dadosCompletos.viatura_nome || 'N/I'}
- Prefixo: ${dadosCompletos.viatura_prefixo || 'N/I'}
- Placa: ${dadosCompletos.viatura_placa || 'N/I'}

📅 **DATAS E HORÁRIOS:**
- Solicitação: ${dataSolicitacao}
- Necessidade: ${dataNecessidade}
- Entrega chaves: ${dataEntrega}

📊 **QUILOMETRAGEM:**
- KM inicial: ${kmInicialDB.toLocaleString('pt-BR')}
- KM final: ${kmFinal.toLocaleString('pt-BR')}
- KM rodados: ${kmRodados.toLocaleString('pt-BR')}

📝 **MOTIVO:**
${dadosCompletos.motivo || 'N/I'}

═══════════════════════════════
✅ **SOLICITAÇÃO FINALIZADA**
🎉 Obrigado por utilizar o sistema!
       `, { 
           chat_id: sessao.chatId, 
           message_id: solicitacao.messageIds.solicitante, 
           parse_mode: 'Markdown' 
       });

       await stateManager.deleteSession(userId);
       return true;
   } catch (error) {
       console.error('Erro ao salvar KM final:', error);
       bot.sendMessage(sessao.chatId, '❌ Erro ao salvar KM final. Tente novamente.');
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
   processarRespostaVistoriador,
   handleSelecionarViatura,
   notificarAutorizadores,
   processarAutorizacao,
   notificarRadioOperadores,
   solicitarKmInicial,
   solicitarKmFinal,
   processarEntradaKmInicial,
   processarEntradaKmFinal,
   processarEntregaChaves
};