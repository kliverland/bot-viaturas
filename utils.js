// utils.js
'use strict';
const { NIVEIS_PERMISSAO, ANTECEDENCIA_MINIMA_MINUTOS } = require('./config');

function formatarDataHora() {
    const agora = new Date();
    return agora.toLocaleString('pt-BR', {
        timeZone: 'America/Sao_Paulo', // Ajuste o fuso horário conforme necessário
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function validarAntecedencia(dataHoraNecessidade) {
    const agora = new Date();
    const [dataParte, horaParte] = dataHoraNecessidade.split(' ');
    const [dia, mes, ano] = dataParte.split('/');
    const [hora, minuto] = horaParte.split(':');
    const necessidade = new Date(parseInt(ano), parseInt(mes) - 1, parseInt(dia), parseInt(hora), parseInt(minuto));

    const diferencaMinutos = (necessidade - agora) / (1000 * 60);
    console.log(`Validação de antecedência: Atual: ${agora.toLocaleString('pt-BR')}, Necessidade: ${necessidade.toLocaleString('pt-BR')}, Diferença: ${diferencaMinutos} min`);
    return diferencaMinutos >= ANTECEDENCIA_MINIMA_MINUTOS;
}

function temPermissao(tipoUsuario, tipoRequerido) {
    if (!NIVEIS_PERMISSAO[tipoUsuario] || !NIVEIS_PERMISSAO[tipoRequerido]) {
        return false; // Tipos desconhecidos não têm permissão
    }
    return NIVEIS_PERMISSAO[tipoUsuario] >= NIVEIS_PERMISSAO[tipoRequerido];
}

module.exports = {
    formatarDataHora,
    validarAntecedencia,
    temPermissao
};
