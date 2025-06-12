// controllers/botHandlers.js
const TelegramBot = require('node-telegram-bot-api');
const config = require('../config');
const stateManager = require('../stateManager');
const utils = require('../utils');
const db = require('../db');
const authService = require('../services/authService');
const requestService = require('../services/requestService');
const vehicleService = require('../services/vehicleService');
const statusService = require('../services/statusService');

let botInstance;

function init(bot) {
    botInstance = bot;

    // Comando /start
    bot.onText(/\/start/, async (msg) => {
        const usuario = await authService.verificarAcesso(bot, msg);
        if (!usuario) return;

        let welcomeMessage = `🚗 *Bot de Solicitação de Viaturas* 🚗\n\nBem-vindo, ${escapeMarkdown(usuario.nome)}!\n\n*Comandos disponíveis:*\n• /solicitarviatura - Solicitar uma viatura\n• /status - Ver status das suas solicitações\n• /help - Ajuda`;
        if (utils.temPermissao(usuario.tipo_usuario, 'vistoriador')) {
            welcomeMessage += `\n\n*Comandos do Vistoriador:*\n• /addviatura - Cadastrar nova viatura\n• /listviaturas - Ver todas as viaturas\n• /adduser - Pré-cadastrar novo usuário\n• /updatestatus - Atualizar status de viatura`;
        }
        bot.sendMessage(msg.chat.id, welcomeMessage, { parse_mode: 'Markdown' });
    });

    // Comando /adduser
    bot.onText(/\/adduser/, async (msg) => {
        const usuarioVistoriador = await authService.verificarAcesso(bot, msg, 'vistoriador');
        if (!usuarioVistoriador) return;

        authService.iniciarPreCadastroUsuario(bot, msg.chat.id, msg.from.id);
    });

    // Comando /updatestatus
    bot.onText(/\/updatestatus/, async (msg) => {
        const usuario = await authService.verificarAcesso(bot, msg, 'vistoriador');
        if (!usuario) return;
        
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        
        await statusService.listarViaturasParaAtualizacao(bot, chatId, userId);
    });

    // Comando /addviatura
    bot.onText(/\/addviatura/, async (msg) => {
        const usuario = await authService.verificarAcesso(bot, msg, 'vistoriador');
        if (!usuario) return;

        await stateManager.setSession(msg.from.id, {
            etapa: 'aguardando_prefixo',
            chatId: msg.chat.id,
            novaViatura: {}
        });
        bot.sendMessage(msg.chat.id, `🚗 *CADASTRAR NOVA VIATURA*\n\nVamos cadastrar uma nova viatura no sistema.\n\n📝 *Etapa 1/6: PREFIXO*\n\nDigite o prefixo da viatura (ex: VTR006):`, { parse_mode: 'Markdown' });
    });

    // Comando /listviaturas
    bot.onText(/\/listviaturas/, async (msg) => {
        const usuario = await authService.verificarAcesso(bot, msg, 'vistoriador');
        if (!usuario) return;
        try {
            const rows = await db.getTodasViaturasDB();
            if (rows.length === 0) {
                bot.sendMessage(msg.chat.id, '📋 Não há viaturas cadastradas no sistema.');
                return;
            }
            let mensagem = '*🚗 VIATURAS CADASTRADAS:*\n\n';
            rows.forEach(viatura => {
                mensagem += `${config.STATUS_VIATURAS[viatura.status] || '⚪ Status Desconhecido'} *${escapeMarkdown(viatura.prefixo)}*\n`;
                mensagem += `• Nome: ${escapeMarkdown(viatura.nome)}\n`;
                mensagem += `• Modelo: ${escapeMarkdown(viatura.modelo || 'N/I')}\n`;
                mensagem += `• Placa: ${escapeMarkdown(viatura.placa || 'N/I')}\n`;
                mensagem += `• KM: ${parseInt(viatura.km_atual || 0).toLocaleString('pt-BR')}\n\n`;
            });
            const totalDisponiveis = rows.filter(v => v.status === 'disponivel').length;
            mensagem += `📊 *Total disponíveis: ${totalDisponiveis}/${rows.length}*`;
            bot.sendMessage(msg.chat.id, mensagem, { parse_mode: 'Markdown' });
        } catch (error) {
            console.error('Erro ao listar viaturas:', error);
            bot.sendMessage(msg.chat.id, '❌ Erro ao consultar viaturas.');
        }
    });

    // Comando /solicitarviatura
    bot.onText(/\/solicitarviatura/, async (msg) => {
        const usuario = await authService.verificarAcesso(bot, msg);
        if (!usuario) return;

        const keyboard = { inline_keyboard: [
            [{ text: '✅ CONCORDO E ACEITO', callback_data: `aceitar_responsabilidade_${msg.from.id}` }],
            [{ text: '❌ CANCELAR', callback_data: `cancelar_solicitacao_${msg.from.id}` }]
        ]};
        bot.sendMessage(msg.chat.id, `
📋 *SOLICITAÇÃO DE VIATURA - TERMOS DE RESPONSABILIDADE*

Antes de prosseguir, você deve estar ciente das seguintes responsabilidades:
🔸 **Comprometo-me a devolver a viatura no mesmo estado em que a recebi**
🔸 **Responsabilizo-me por qualquer dano causado durante o período de uso**
🔸 **Ficha DNA da viatura está disponível na sala do rádio-operador**
🔸 **É facultada vistoria própria antes da retirada para sua proteção**
🔸 **Qualquer avaria deve ser comunicada imediatamente**

⏰ **IMPORTANTE: Solicitação deve ser feita com pelo menos ${config.ANTECEDENCIA_MINIMA_MINUTOS} minutos de antecedência!**

*Você concorda com estes termos?*
        `, { parse_mode: 'Markdown', reply_markup: keyboard });
    });

    // Comando /status
    bot.onText(/\/status/, async (msg) => {
        const usuario = await authService.verificarAcesso(bot, msg);
        if (!usuario) return;
        try {
            const rows = await db.getSolicitacoesUsuarioDB(msg.from.id);
            if (rows.length === 0) {
                bot.sendMessage(msg.chat.id, '📋 Você não possui solicitações registradas.');
                return;
            }
            let mensagem = '*📋 SUAS SOLICITAÇÕES:*\n\n';
            const statusEmoji = { 'aguardando_vistoria': '🟡', 'em_vistoria': '🟠', 'aguardando_autorizacao': '🔵', 'autorizada': '✅', 'negada': '❌', 'entregue': '🚗', 'finalizada': '🏁' };
            rows.forEach(sol => {
                mensagem += `${statusEmoji[sol.status_final] || '⚪'} *${escapeMarkdown(sol.codigo_solicitacao)}*\n`;
                mensagem += `• Status: ${escapeMarkdown(sol.status_final.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()) || 'Desconhecido')}\n`;
                mensagem += `• Solicitação: ${new Date(sol.data_solicitacao).toLocaleString('pt-BR')}\n`;
                mensagem += `• Necessidade: ${new Date(sol.data_necessidade).toLocaleString('pt-BR')}\n`;
                if (sol.motivo) mensagem += `• Motivo: ${escapeMarkdown(sol.motivo)}\n`;
                if (sol.viatura_prefixo) mensagem += `• Viatura: ${escapeMarkdown(sol.viatura_prefixo)}\n`;
                mensagem += '\n';
            });
            bot.sendMessage(msg.chat.id, mensagem, { parse_mode: 'Markdown' });
        } catch (error) {
            console.error('Erro ao buscar status:', error);
            bot.sendMessage(msg.chat.id, '❌ Erro ao consultar suas solicitações.');
        }
    });

    // Comando /help
    bot.onText(/\/help/, async (msg) => {
        const usuario = await authService.verificarAcesso(bot, msg);
        if (!usuario) return;
        
        let helpMessage = `🆘 *AJUDA - Bot de Viaturas*\n\n`;
        
        helpMessage += `*📋 Comandos Básicos:*\n`;
        helpMessage += `• /start - Iniciar o bot\n`;
        helpMessage += `• /solicitarviatura - Fazer nova solicitação\n`;
        helpMessage += `• /status - Ver suas solicitações\n`;
        helpMessage += `• /help - Esta mensagem de ajuda\n\n`;
        
        if (utils.temPermissao(usuario.tipo_usuario, 'radio_operador')) {
            helpMessage += `*📻 Comandos do Rádio-Operador:*\n`;
            helpMessage += `• Entregar chaves das solicitações autorizadas\n\n`;
        }
        
        if (utils.temPermissao(usuario.tipo_usuario, 'vistoriador')) {
            helpMessage += `*🛠️ Comandos do Vistoriador:*\n`;
            helpMessage += `• /addviatura - Cadastrar nova viatura\n`;
            helpMessage += `• /listviaturas - Ver todas as viaturas\n`;
            helpMessage += `• /updatestatus - Atualizar status de viatura\n`;
            helpMessage += `• /adduser - Pré-cadastrar novo usuário\n`;
            helpMessage += `• Atender solicitações de vistoria\n\n`;
        }
        
        if (utils.temPermissao(usuario.tipo_usuario, 'autorizador')) {
            helpMessage += `*🔑 Comandos do Autorizador:*\n`;
            helpMessage += `• Autorizar/negar solicitações vistoriadas\n\n`;
        }
        
        helpMessage += `*🔄 Como funciona o processo:*\n`;
        helpMessage += `1️⃣ Solicitante aceita termos de responsabilidade\n`;
        helpMessage += `2️⃣ Informa data e hora necessária\n`;
        helpMessage += `3️⃣ Descreve o motivo da solicitação\n`;
        helpMessage += `4️⃣ Vistoriador analisa e seleciona viatura\n`;
        helpMessage += `5️⃣ Autorizador aprova ou nega\n`;
        helpMessage += `6️⃣ Rádio-operador entrega as chaves\n`;
        helpMessage += `7️⃣ Solicitante informa KM inicial e final\n\n`;
        
        helpMessage += `*⚠️ Informações Importantes:*\n`;
        helpMessage += `⏰ Antecedência mínima: ${config.ANTECEDENCIA_MINIMA_MINUTOS} minutos\n`;
        helpMessage += `📋 Ficha DNA disponível na sala do rádio-operador\n`;
        helpMessage += `🔍 Vistoria prévia é facultativa para sua proteção\n`;
        helpMessage += `📊 Sempre informe a quilometragem corretamente\n\n`;
        
        helpMessage += `*❓ Dúvidas?* Entre em contato com a administração.`;
        
        bot.sendMessage(msg.chat.id, helpMessage, { parse_mode: 'Markdown' });
    });

    // Comando /debug
    bot.onText(/\/debug/, async (msg) => {
        const usuario = await authService.verificarAcesso(bot, msg);
        if (!usuario) return;
        const vistoriadores = await db.getUsuariosPorTipoDB('vistoriador');
        let debugMessage = `🔍 *DEBUG - Informações do Sistema*\n\n👤 *Seus dados:*\n• ID: ${msg.from.id}\n• Nome: ${escapeMarkdown(usuario.nome)}\n• Tipo: ${usuario.tipo_usuario}\n\n`;
        debugMessage += `👥 *Vistoriadores (${vistoriadores.length}):*\n`;
        vistoriadores.forEach((v, i) => { debugMessage += `${i + 1}. ${escapeMarkdown(v.nome)} (Telegram ID: ${v.telegram_id}) ${v.telegram_id == msg.from.id ? '← VOCÊ' : ''}\n`; });
        if (vistoriadores.length === 0) {
            debugMessage += `⚠️ *PROBLEMA: Nenhum vistoriador encontrado no banco!*\n`;
        }
        bot.sendMessage(msg.chat.id, debugMessage, { parse_mode: 'Markdown' });
    });

    // Handler para mensagens de texto
    bot.on('message', async (msg) => {
        const texto = msg.text;

        // Se a mensagem for nula ou começar com '/', ignoramos, pois é um comando.
        if (!texto || texto.startsWith('/')) return;

        const sessao = await stateManager.getSession(msg.from.id);
        if (!sessao || !sessao.etapa) return;

        console.log(`MessageHandler: Etapa=${sessao.etapa}, UserID=${msg.from.id}, Texto=${texto}`);

        let handled = false;
        // >>> ALTERAÇÃO: Passando o objeto 'msg' completo para os handlers <<<
        // Isso permite que os handlers acessem o message_id para apagar a mensagem do usuário.
        
        // Fluxo de Autenticação/Cadastro do próprio usuário
        if (!handled && sessao.etapa === 'aguardando_cpf') handled = await authService.processarEntradaCpf(bot, msg);
        if (!handled && sessao.etapa === 'aguardando_matricula') handled = await authService.processarEntradaMatricula(bot, msg);
        if (!handled && sessao.etapa === 'aguardando_nome') handled = await authService.processarEntradaNome(bot, msg);

        // Fluxo de Pré-cadastro de Usuário
        if (!handled && sessao.etapa === 'precad_aguardando_cpf') handled = await authService.processarEntradaCpfPreCadastro(bot, msg);
        if (!handled && sessao.etapa === 'precad_aguardando_matricula') handled = await authService.processarEntradaMatriculaPreCadastro(bot, msg);

        // Fluxo de Solicitação de Viatura
        if (!handled && sessao.etapa === 'aguardando_data') handled = await requestService.processarEntradaDataSolicitacao(bot, msg);
        if (!handled && sessao.etapa === 'aguardando_hora') handled = await requestService.processarEntradaHoraSolicitacao(bot, msg);
        if (!handled && sessao.etapa === 'aguardando_motivo') handled = await requestService.processarEntradaMotivoSolicitacao(bot, msg);

        // Fluxo de Cadastro de Viatura
        if (!handled && sessao.etapa === 'aguardando_prefixo') handled = await vehicleService.processarEntradaPrefixoViatura(bot, msg);
        if (!handled && sessao.etapa === 'aguardando_nome_viatura') handled = await vehicleService.processarEntradaNomeViatura(bot, msg);
        if (!handled && sessao.etapa === 'aguardando_modelo') handled = await vehicleService.processarEntradaModeloViatura(bot, msg);
        if (!handled && sessao.etapa === 'aguardando_placa') handled = await vehicleService.processarEntradaPlacaViatura(bot, msg);
        if (!handled && sessao.etapa === 'aguardando_km') handled = await vehicleService.processarEntradaKmViatura(bot, msg);
        
        // Fluxo de KM inicial e final
        if (!handled && sessao.etapa === 'aguardando_km_inicial') handled = await requestService.processarEntradaKmInicial(bot, msg);
        if (!handled && sessao.etapa === 'aguardando_km_final') handled = await requestService.processarEntradaKmFinal(bot, msg);
    });

    // Handler para callbacks
    bot.on('callback_query', async (callbackQuery) => {
        const message = callbackQuery.message;
        const data = callbackQuery.data;
        const chatId = message.chat.id;
        const userIdClicou = callbackQuery.from.id;

        console.log(`CallbackQuery: Data='${data}', UserID Clicou=${userIdClicou}, ChatID=${chatId}, MessageID=${message.message_id}`);

        // Handler para pré-cadastro de tipo de usuário
        if (data.startsWith('precad_tipo_')) {
            const parts = data.split('_');
            if (parts.length === 4 && parts[0] === 'precad' && parts[1] === 'tipo') {
                const tipoUsuarioSelecionado = parts[2];
                const idVistoriadorEsperado = parts[3];

                if (userIdClicou.toString() !== idVistoriadorEsperado) {
                    bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Esta ação de cadastro não é sua.' });
                    return;
                }
                await authService.handleTipoUsuarioPreCadastroCallback(bot, callbackQuery, tipoUsuarioSelecionado);
                return;
            }
            return;
        }

        // Selecionar viatura pelo número
        if (data.startsWith('select_viatura_')) {
            const [_, __, viaturaId, numeroViatura, solicitanteId] = data.split('_');
    
            if (userIdClicou.toString() !== solicitanteId) {
                bot.answerCallbackQuery(callbackQuery.id, {text: '❌ Esta ação não é sua.'});
                return;
            }
    
            await statusService.mostrarOpcoesStatus(bot, callbackQuery, viaturaId, numeroViatura);
            return;
        }

        // Alterar status da viatura
        if (data.startsWith('change_status_')) {
            const [_, __, viaturaId, novoStatus, solicitanteId] = data.split('_');
    
            if (userIdClicou.toString() !== solicitanteId) {
                bot.answerCallbackQuery(callbackQuery.id, {text: '❌ Esta ação não é sua.'});
                return;
            }
    
            await statusService.alterarStatusViatura(bot, callbackQuery, viaturaId, novoStatus);
            return;
        }

        // >>> ALTERAÇÃO: Novo fluxo de aceitar responsabilidade <<<
    if (data.startsWith('aceitar_responsabilidade_')) {
        const solicitanteIdOriginal = data.split('_')[2];
    if (userIdClicou.toString() !== solicitanteIdOriginal) {
        bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Esta ação não é sua.' });
    return;
    }
    const usuarioAuth = await authService.verificarAutenticacao(userIdClicou);
    const nomeUsuario = usuarioAuth ? usuarioAuth.nome : callbackQuery.from.first_name;
    
    // Inicia a sessão para o novo fluxo interativo
    await stateManager.setSession(userIdClicou, { 
        nomeUsuario: nomeUsuario, 
        chatId: chatId,
        // Salva o ID da "Mensagem A" que será editada durante o fluxo
        interactiveMessageId: message.message_id 
    });
    
    // Inicia o fluxo de coleta de dados editando a mensagem
    await requestService.solicitarData(bot, userIdClicou); // Esta função será alterada
    bot.answerCallbackQuery(callbackQuery.id, { text: '✅ Termos aceitos! Prossiga...' });
    return;
}
        // Handler para cancelar solicitação
        if (data.startsWith('cancelar_solicitacao_')) {
            const solicitanteIdOriginal = data.split('_')[2];
            if (userIdClicou.toString() !== solicitanteIdOriginal) {
                bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Ação de cancelamento não é sua.' });
                return;
            }
            await bot.editMessageText(`❌ *SOLICITAÇÃO CANCELADA*\n\nSua solicitação foi cancelada.`, { chat_id: chatId, message_id: message.message_id, parse_mode: 'Markdown' });
            await stateManager.deleteSession(userIdClicou);
            bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Solicitação cancelada.' });
            return;
        }

        // Handler para informar KM inicial
        if (data.startsWith('km_inicial_')) {
            const [_, __, codigoSolicitacao, solicitanteIdOriginal] = data.split('_');
            
            if (userIdClicou.toString() !== solicitanteIdOriginal) {
                bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Esta ação não é sua.' });
                return;
            }

            await bot.editMessageText(`
🎉 *CHAVES ENTREGUES - ${codigoSolicitacao}*

Agora você precisa informar a quilometragem inicial da viatura.
            `, { 
                chat_id: chatId, 
                message_id: message.message_id, 
                parse_mode: 'Markdown' 
            });

            requestService.solicitarKmInicial(bot, chatId, userIdClicou, codigoSolicitacao);
            bot.answerCallbackQuery(callbackQuery.id, { text: '📊 Informe o KM inicial' });
            return;
        }

        // Handler para informar KM final
        if (data.startsWith('km_final_')) {
            const [_, __, codigoSolicitacao, solicitanteIdOriginal] = data.split('_');
            
            if (userIdClicou.toString() !== solicitanteIdOriginal) {
                bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Esta ação não é sua.' });
                return;
            }

            try {
                const kmInicial = await db.getKmInicialSolicitacao(codigoSolicitacao);
                if (!kmInicial) {
                    bot.answerCallbackQuery(callbackQuery.id, { text: '❌ KM inicial não encontrado.' });
                    return;
                }

                const solicitacao = stateManager.getRequest(codigoSolicitacao);
                await bot.editMessageText(`
📊 *INFORMAR KM FINAL - ${codigoSolicitacao}*

✅ KM inicial: ${kmInicial.toLocaleString('pt-BR')}

Digite a quilometragem final da viatura:
                `, { 
                    chat_id: chatId, 
                    message_id: solicitacao.messageIds.solicitante,
                    parse_mode: 'Markdown' 
                });

                requestService.solicitarKmFinal(bot, chatId, userIdClicou, codigoSolicitacao, kmInicial);
                bot.answerCallbackQuery(callbackQuery.id, { text: '📊 Informe o KM final' });
            } catch (error) {
                console.error('Erro ao buscar KM inicial:', error);
                bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Erro ao processar solicitação.' });
            }
            return;
        }
        
        // >>> ALTERAÇÃO: Novo fluxo para o botão "HOJE" <<<
        if (data.startsWith('data_hoje_')) {
            const solicitanteIdOriginal = data.split('_')[2];
            if (userIdClicou.toString() !== solicitanteIdOriginal) {
                bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Esta ação não é sua.' });
                return;
            }
            const hoje = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
            const sessao = await stateManager.getSession(userIdClicou);
            if (!sessao) {
                bot.answerCallbackQuery(callbackQuery.id, { text: 'Sessão expirada.' });
                return;
            }
            
            // Atualiza a sessão com a data e avança o fluxo
            sessao.data = hoje;
            await stateManager.setSession(userIdClicou, sessao);
            
            // Chama a função que edita a mensagem e pede a hora
            await requestService.solicitarHora(bot, userIdClicou); 
            
            bot.answerCallbackQuery(callbackQuery.id, { text: '✅ Data de hoje selecionada!' });
            return;
        }

        // Handler para status da viatura no cadastro
        if (data.startsWith('status_viatura_')) {
            const parts = data.split('_');
            const statusViatura = parts[2];
            const userIdCadastroOriginal = parts[3];
            if (userIdClicou.toString() !== userIdCadastroOriginal) {
                bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Esta ação de cadastro não é sua.' });
                return;
            }
            await vehicleService.handleStatusViaturaCallback(bot, callbackQuery, statusViatura);
            return;
        }

        // Handler para responder vistoria
        if (data.startsWith('responder_vistoria_')) {
            try {
                const codigoSolicitacao = data.split('_')[2];
                const usuario = await authService.verificarAutenticacao(userIdClicou);
                if (!usuario || !utils.temPermissao(usuario.tipo_usuario, 'vistoriador')) {
                    bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Sem permissão para atender vistoria.' });
                    return;
                }

                const erro = await requestService.processarRespostaVistoriador(bot, userIdClicou, codigoSolicitacao);
                if (erro) {
                    bot.answerCallbackQuery(callbackQuery.id, { text: erro });
                    return;
                }

                const viaturasDisponiveis = await db.getViaturasDisponiveisDB();
                if (viaturasDisponiveis.length === 0) {
                    await bot.editMessageText(`❌ *SEM VIATURAS DISPONÍVEIS*\n\nNão há viaturas disponíveis no momento para atender esta solicitação.\n\nCódigo: ${codigoSolicitacao}`, { chat_id: chatId, message_id: message.message_id, parse_mode: 'Markdown' });
                    bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Sem viaturas disponíveis!' });
                    return;
                }

                const keyboard = { inline_keyboard: viaturasDisponiveis.map(v => [{ text: `${v.prefixo} - ${v.nome}`, callback_data: `selecionar_viatura_${codigoSolicitacao}_${v.id}` }]) };
                await bot.editMessageText(`✅ *SOLICITAÇÃO ATENDIDA POR VOCÊ - ${codigoSolicitacao}*\n\nSelecione a viatura para esta solicitação:`, { chat_id: chatId, message_id: message.message_id, parse_mode: 'Markdown', reply_markup: keyboard });
                bot.answerCallbackQuery(callbackQuery.id, { text: '✅ Solicitação atendida! Escolha a viatura.' });

            } catch (error) {
                console.error("Erro ao responder vistoria ou buscar viaturas:", error);
                bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Erro ao processar a ação.' });
            }
            return;
        }

        // Handler para selecionar viatura
        if (data.startsWith('selecionar_viatura_')) {
            const parts = data.split('_');
            const codigoSolicitacao = parts[2];
            const viaturaId = parts[3];
            const usuario = await authService.verificarAutenticacao(userIdClicou);
            if (!usuario || !utils.temPermissao(usuario.tipo_usuario, 'vistoriador')) {
                bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Sem permissão para selecionar viatura.' });
                return;
            }
            await requestService.handleSelecionarViatura(bot, callbackQuery, codigoSolicitacao, viaturaId);
            return;
        }

        // Handler para autorizar solicitação
        if (data.startsWith('autorizar_sol_')) {
            const codigoSolicitacao = data.substring('autorizar_sol_'.length);
            const usuario = await authService.verificarAutenticacao(userIdClicou);
            if (!usuario || !utils.temPermissao(usuario.tipo_usuario, 'autorizador')) {
                bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Sem permissão para autorizar.' });
                return;
            }
            const erro = await requestService.processarAutorizacao(bot, userIdClicou, codigoSolicitacao, true);
            if (erro) {
                bot.answerCallbackQuery(callbackQuery.id, { text: erro });
                return;
            }
            bot.answerCallbackQuery(callbackQuery.id, { text: '✅ Solicitação autorizada!' });
           return;
       }

       // Handler para não autorizar solicitação
       if (data.startsWith('nao_autorizar_sol_')) {
           const codigoSolicitacao = data.substring('nao_autorizar_sol_'.length);
           const usuario = await authService.verificarAutenticacao(userIdClicou);
           if (!usuario || !utils.temPermissao(usuario.tipo_usuario, 'autorizador')) {
               bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Sem permissão para negar autorização.' });
               return;
           }
           const erro = await requestService.processarAutorizacao(bot, userIdClicou, codigoSolicitacao, false);
           if (erro) {
               bot.answerCallbackQuery(callbackQuery.id, { text: erro });
               return;
           }
           bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Solicitação não autorizada.' });
           return;
       }

       // Handler para entregar chaves
       if (data.startsWith('entregar_chaves_')) {
           const codigoSolicitacao = data.split('_')[2];
           const usuario = await authService.verificarAutenticacao(userIdClicou);
           if (!usuario || !utils.temPermissao(usuario.tipo_usuario, 'radio_operador')) {
               bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Sem permissão para entregar chaves.' });
               return;
           }
           const erro = await requestService.processarEntregaChaves(bot, userIdClicou, codigoSolicitacao);
           if (erro) {
               bot.answerCallbackQuery(callbackQuery.id, { text: erro });
               return;
           }
           bot.answerCallbackQuery(callbackQuery.id, { text: '✅ Chaves entregues!' });
           return;
       }

       // Se chegou até aqui, o callback não foi tratado
       console.warn(`CallbackQuery não tratado: ${data} pelo usuário ${userIdClicou}`);
       bot.answerCallbackQuery(callbackQuery.id, { text: 'Ação não reconhecida ou expirada.' });
   });
}

module.exports = {
   init
};
