// services/authService.js
'use strict';
const db = require('../db');
const { temPermissao } = require('../utils');
const stateManager = require('../stateManager');
const { TIPOS_USUARIO_CADASTRO } = require('../config');

async function verificarAutenticacao(telegramId) {
    try {
        return await db.getUsuarioAutenticadoDB(telegramId);
    } catch (error) {
        console.error('Erro em authService.verificarAutenticacao:', error);
        return null;
    }
}

async function verificarAcesso(bot, msg, requiredType = null) {
    const userId = msg.from.id;
    const chatId = msg.chat.id;

    const usuario = await verificarAutenticacao(userId);

    if (!usuario) {
        await iniciarProcessoCadastro(bot, chatId, userId);
        return null;
    }

    if (requiredType && !temPermissao(usuario.tipo_usuario, requiredType)) {
        bot.sendMessage(chatId, `❌ Este comando requer permissão de ${requiredType} ou superior.`);
        return null;
    }
    return usuario;
}

async function iniciarProcessoCadastro(bot, chatId, userId) {
    await stateManager.setSession(userId, {
        etapa: 'aguardando_cpf',
        chatId: chatId
    });
    bot.sendMessage(chatId, `
🔐 *PRIMEIRO ACESSO - AUTENTICAÇÃO*

Para usar este bot, você precisa se autenticar.

📋 *Etapa 1/3: CPF*

Digite seu CPF (apenas números, sem pontos ou traços):
    `, { parse_mode: 'Markdown' });
}

async function processarEntradaCpf(bot, userId, texto) {
    const sessao = await stateManager.getSession(userId);
    if (!sessao || sessao.etapa !== 'aguardando_cpf') return false;

    const cpfLimpo = texto.replace(/\D/g, '');
    if (cpfLimpo.length !== 11) {
        bot.sendMessage(sessao.chatId, `
❌ *CPF INVÁLIDO*

O CPF deve conter exatamente 11 números.
Digite apenas números, sem pontos ou traços.

Digite seu CPF novamente:
        `, { parse_mode: 'Markdown' });
        return true;
    }

    const cpfFormatado = cpfLimpo.padStart(11, '0');
    sessao.cpf = cpfFormatado;
    sessao.etapa = 'aguardando_matricula';
    await stateManager.setSession(userId, sessao);

    console.log(`CPF processado: original="${cpfLimpo}", formatado="${cpfFormatado}"`);
    bot.sendMessage(sessao.chatId, `
✅ *CPF registrado*

📋 *Etapa 2/3: MATRÍCULA*

Digite sua matrícula:
    `, { parse_mode: 'Markdown' });
    return true;
}

async function processarEntradaMatricula(bot, userId, texto) {
    const sessao = await stateManager.getSession(userId);
    if (!sessao || sessao.etapa !== 'aguardando_matricula') return false;

    if (!texto || texto.trim().length < 3) {
        bot.sendMessage(sessao.chatId, `
❌ *MATRÍCULA INVÁLIDA*

Digite uma matrícula válida.

Digite sua matrícula novamente:
        `, { parse_mode: 'Markdown' });
        return true;
    }

    const matricula = texto.trim().toUpperCase();
    sessao.matricula = matricula;
    await stateManager.setSession(userId, sessao);

    await processarAutenticacaoCompleta(bot, userId, sessao.cpf, matricula);
    return true;
}

async function processarEntradaNome(bot, userId, texto) {
    const sessao = await stateManager.getSession(userId);
    if (!sessao || sessao.etapa !== 'aguardando_nome') return false;

    if (!texto || texto.trim().length < 2) {
        bot.sendMessage(sessao.chatId, `
❌ *NOME MUITO CURTO*

Digite um nome ou apelido com pelo menos 2 caracteres.
Digite seu nome novamente:
        `, { parse_mode: 'Markdown' });
        return true;
    }

    const nome = texto.trim();
    await finalizarCadastro(bot, userId, nome);
    return true;
}

async function finalizarCadastro(bot, userId, nome) {
    const sessao = await stateManager.getSession(userId);
    try {
        const sucesso = await db.vincularTelegramUsuarioDB(sessao.usuarioId, userId, nome);
        if (sucesso) {
            const usuarioDB = await db.getUsuarioPorCpfMatricula(sessao.cpf, sessao.matricula);

            let tipoLabel = usuarioDB.tipo_usuario;
            if (TIPOS_USUARIO_CADASTRO) {
                const tipoCustom = TIPOS_USUARIO_CADASTRO.find(t => t.value === usuarioDB.tipo_usuario);
                if (tipoCustom) tipoLabel = tipoCustom.label;
            }

            bot.sendMessage(sessao.chatId, `
🎉 *CADASTRO CONCLUÍDO COM SUCESSO!*

Bem-vindo, ${nome}!
✅ Seu acesso foi liberado como ${tipoLabel}.
✅ Agora você pode usar todos os comandos do bot.
Digite /help para ver os comandos disponíveis.
    `, { parse_mode: 'Markdown' });
        } else {
            bot.sendMessage(sessao.chatId, '❌ Erro ao finalizar cadastro. Tente novamente.');
        }
    } catch (error) {
        console.error('Erro ao finalizar cadastro:', error);
        bot.sendMessage(sessao.chatId, '❌ Erro interno. Tente novamente mais tarde.');
    } finally {
        await stateManager.deleteSession(userId);
    }
}

async function iniciarPreCadastroUsuario(bot, chatIdVistoriador, userIdVistoriador) {
    await stateManager.setSession(userIdVistoriador, {
        etapa: 'precad_aguardando_cpf',
        chatId: chatIdVistoriador
    });
    bot.sendMessage(chatIdVistoriador, `
🆕 *CADASTRAR NOVO USUÁRIO*

📋 *Etapa 1/3: CPF do Novo Usuário*
Digite o CPF do novo usuário (apenas 11 números):
    `, { parse_mode: 'Markdown' });
}

async function processarEntradaCpfPreCadastro(bot, userIdVistoriador, textoCpf) {
    const sessao = await stateManager.getSession(userIdVistoriador);
    if (!sessao || sessao.etapa !== 'precad_aguardando_cpf') return false;

    const cpfLimpo = textoCpf.replace(/\D/g, '');
    if (cpfLimpo.length !== 11) {
        bot.sendMessage(sessao.chatId, `❌ *CPF INVÁLIDO*\nO CPF deve conter exatamente 11 números.\n\nDigite o CPF novamente:`, { parse_mode: 'Markdown' });
        return true;
    }

    const check = await db.checkUsuarioExistsDB(cpfLimpo, null);
    if (check.exists && check.byCpf) {
        bot.sendMessage(sessao.chatId, `❌ *ERRO: CPF ${cpfLimpo} já cadastrado no sistema.* Tente novamente com outro CPF ou verifique os dados.`, { parse_mode: 'Markdown' });
        await stateManager.deleteSession(userIdVistoriador);
        return true;
    }

    sessao.novoUsuarioCpf = cpfLimpo;
    sessao.etapa = 'precad_aguardando_matricula';
    await stateManager.setSession(userIdVistoriador, sessao);

    bot.sendMessage(sessao.chatId, `✅ *CPF ${cpfLimpo} válido.*\n\n📋 *Etapa 2/3: MATRÍCULA do Novo Usuário*\nDigite a matrícula do novo usuário (apenas números):`, { parse_mode: 'Markdown' });
    return true;
}

async function processarEntradaMatriculaPreCadastro(bot, userIdVistoriador, textoMatricula) {
    const sessao = await stateManager.getSession(userIdVistoriador);
    if (!sessao || sessao.etapa !== 'precad_aguardando_matricula') return false;

    const matriculaLimpa = textoMatricula.replace(/\D/g, '');
    if (matriculaLimpa.length === 0) {
        bot.sendMessage(sessao.chatId, `❌ *MATRÍCULA INVÁLIDA*\nDigite uma matrícula válida (apenas números).\n\nDigite a matrícula novamente:`, { parse_mode: 'Markdown' });
        return true;
    }

    const check = await db.checkUsuarioExistsDB(null, matriculaLimpa);
    if (check.exists && check.byMatricula) {
        bot.sendMessage(sessao.chatId, `❌ *ERRO: Matrícula ${matriculaLimpa} já cadastrada no sistema.* Tente novamente com outra matrícula ou verifique os dados.`, { parse_mode: 'Markdown' });
        await stateManager.deleteSession(userIdVistoriador);
        return true;
    }

    sessao.novoUsuarioMatricula = matriculaLimpa;
    sessao.etapa = 'precad_aguardando_tipo';
    await stateManager.setSession(userIdVistoriador, sessao);

    const keyboardTipos = {
        inline_keyboard: TIPOS_USUARIO_CADASTRO.map(tipo => ([
            { text: tipo.label, callback_data: `precad_tipo_${tipo.value}_${userIdVistoriador}` }
        ]))
    };

    bot.sendMessage(sessao.chatId, `✅ *Matrícula ${matriculaLimpa} válida.*\n\n📋 *Etapa 3/3: TIPO do Novo Usuário*\nSelecione o tipo para o novo usuário:`, {
        parse_mode: 'Markdown',
        reply_markup: keyboardTipos
    });
    return true;
}

async function handleTipoUsuarioPreCadastroCallback(bot, callbackQuery, tipoUsuarioSelecionado) {
    const userIdVistoriador = callbackQuery.from.id;
    const chatIdVistoriador = callbackQuery.message.chat.id;
    const messageIdOriginal = callbackQuery.message.message_id;

    const sessao = await stateManager.getSession(userIdVistoriador);
    if (!sessao || sessao.etapa !== 'precad_aguardando_tipo' || !sessao.novoUsuarioCpf || !sessao.novoUsuarioMatricula) {
        bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Sessão inválida ou dados incompletos.' });
        bot.editMessageText('❌ Erro: Sessão de cadastro de usuário inválida. Tente novamente com /adduser.', {
            chat_id: chatIdVistoriador,
            message_id: messageIdOriginal,
            parse_mode: 'Markdown'
        });
        await stateManager.deleteSession(userIdVistoriador);
        return;
    }

    try {
        const check = await db.checkUsuarioExistsDB(sessao.novoUsuarioCpf, sessao.novoUsuarioMatricula);
        if (check.exists) {
            let errorMsg = "❌ ERRO: ";
            if (check.byCpf) errorMsg += `CPF ${sessao.novoUsuarioCpf} já cadastrado. `;
            if (check.byMatricula) errorMsg += `Matrícula ${sessao.novoUsuarioMatricula} já cadastrada.`;
            bot.editMessageText(errorMsg + "\nCadastro cancelado.", {
                chat_id: chatIdVistoriador, message_id: messageIdOriginal, parse_mode: 'Markdown'
            });
            bot.answerCallbackQuery(callbackQuery.id, { text: '❌ CPF ou Matrícula já existe!' });
            await stateManager.deleteSession(userIdVistoriador);
            return;
        }

        await db.preCadastrarUsuarioDB(sessao.novoUsuarioCpf, sessao.novoUsuarioMatricula, tipoUsuarioSelecionado);

        const tipoLabel = TIPOS_USUARIO_CADASTRO.find(t => t.value === tipoUsuarioSelecionado)?.label || tipoUsuarioSelecionado;

        bot.editMessageText(`
✅ *USUÁRIO PRÉ-CADASTRADO COM SUCESSO!*

- CPF: ${sessao.novoUsuarioCpf}
- Matrícula: ${sessao.novoUsuarioMatricula}
- Tipo: ${tipoLabel}

O usuário agora pode fazer o primeiro login no bot para completar o cadastro (definir nome e vincular Telegram).
        `, {
            chat_id: chatIdVistoriador,
            message_id: messageIdOriginal,
            parse_mode: 'Markdown'
        });
        bot.answerCallbackQuery(callbackQuery.id, { text: '✅ Usuário pré-cadastrado!' });

    } catch (error) {
        console.error('Erro ao finalizar pré-cadastro de usuário:', error);
        bot.editMessageText(`❌ Erro ao pré-cadastrar usuário: ${error.message}`, {
            chat_id: chatIdVistoriador,
            message_id: messageIdOriginal,
            parse_mode: 'Markdown'
        });
        bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Erro ao cadastrar.' });
    } finally {
        await stateManager.deleteSession(userIdVistoriador);
    }
}

async function processarAutenticacaoCompleta(bot, userId, cpf, matricula) {
    const sessao = await stateManager.getSession(userId);
    try {
        const usuarioDB = await db.verificarCpfMatriculaDB(cpf, matricula);

        if (!usuarioDB) {
            bot.sendMessage(sessao.chatId, `
❌ *DADOS NÃO ENCONTRADOS*

CPF e Matrícula não foram encontrados no sistema ou não pertencem ao mesmo usuário.
Verifique os dados e tente novamente ou entre em contato com o administrador.
Digite seu CPF novamente:
            `, { parse_mode: 'Markdown' });
            sessao.etapa = 'aguardando_cpf';
            delete sessao.cpf;
            delete sessao.matricula;
            await stateManager.setSession(userId, sessao);
            return;
        }

        if (usuarioDB.telegram_id && usuarioDB.telegram_id !== userId.toString()) {
            bot.sendMessage(sessao.chatId, `
❌ *ACESSO JÁ VINCULADO A OUTRO DISPOSITIVO*
Estes dados já estão vinculados a outro dispositivo/conta do Telegram.
Para transferir o acesso para este dispositivo:
1. Use o comando /revogar no dispositivo antigo (se existir)
2. Ou entre em contato com o administrador.
Acesso negado.
            `, { parse_mode: 'Markdown' });
            await stateManager.deleteSession(userId);
            return;
        }

        if (!usuarioDB.telegram_id || !usuarioDB.nome) {
            sessao.usuarioId = usuarioDB.id;
            sessao.etapa = 'aguardando_nome';
            await stateManager.setSession(userId, sessao);

            bot.sendMessage(sessao.chatId, `
👋 *BEM-VINDO(A) DE VOLTA!*

Seus dados (CPF/Matrícula) foram validados.
Para finalizar seu primeiro acesso neste dispositivo:

📋 *Etapa Final: NOME*
Como você gostaria de ser chamado(a) no sistema?
(Este nome aparecerá nas suas solicitações)
Digite seu nome ou apelido:
            `, { parse_mode: 'Markdown' });
        } else {
            await stateManager.deleteSession(userId);
            bot.sendMessage(sessao.chatId, `✅ *Login realizado com sucesso!*\nBem-vindo(a) de volta, ${usuarioDB.nome}! Use /help para ver os comandos.`);
        }

    } catch (error) {
        console.error('Erro ao processar autenticação completa:', error);
        bot.sendMessage(sessao.chatId, '❌ Erro interno durante a autenticação. Tente novamente mais tarde.');
        await stateManager.deleteSession(userId);
    }
}

module.exports = {
    verificarAutenticacao,
    verificarAcesso,
    iniciarProcessoCadastro,
    processarEntradaCpf,
    processarEntradaMatricula,
    processarEntradaNome,
    iniciarPreCadastroUsuario,
    processarEntradaCpfPreCadastro,
    processarEntradaMatriculaPreCadastro,
    handleTipoUsuarioPreCadastroCallback
};
