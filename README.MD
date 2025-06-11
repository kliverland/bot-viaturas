# Bot de Controle de Frota de Viaturas

Este é um bot para Telegram desenvolvido em Node.js para gerenciar e controlar o uso de uma frota de viaturas. O sistema implementa um fluxo completo de solicitação, vistoria, autorização, e registro de uso, garantindo que todo o processo seja documentado e auditável.

## 📋 Funcionalidades Principais

* **Fluxo de Solicitação Completo:** Desde o pedido do usuário até a devolução da chave, passando por múltiplas etapas de aprovação.
* **Gerenciamento de Permissões:** O sistema conta com 4 níveis de usuário, cada um com suas responsabilidades e comandos específicos.
* **Notificações em Tempo Real:** Usuários e responsáveis são notificados a cada etapa do processo.
* **Controle de Quilometragem:** O solicitante deve informar o KM inicial e final, registrando o total percorrido.
* **Gerenciamento da Frota:** Vistoriadores podem cadastrar novas viaturas e atualizar o status das existentes (ex: em manutenção, disponível, etc.).
* **Autenticação de Usuário:** O primeiro acesso requer autenticação via CPF e Matrícula, vinculando a conta do Telegram a um usuário pré-cadastrado no sistema.
* **Persistência de Dados:** Utiliza um banco de dados MySQL para armazenar informações de usuários, viaturas e logs de solicitações.

## 🔄 O Fluxo de Solicitação de Viatura

O coração do bot é o fluxo de solicitação, que segue as seguintes etapas:

1.  **Solicitação:** Um usuário com permissão de `solicitante` inicia o processo com o comando `/solicitarviatura`.
2.  **Termo de Responsabilidade:** O solicitante deve ler e aceitar os termos de responsabilidade para prosseguir.
3.  **Informações da Missão:** O solicitante informa a data, a hora e o motivo para a necessidade da viatura. A solicitação deve ter uma antecedência mínima configurável (padrão de 30 minutos).
4.  **Notificação ao Vistoriador:** Após o envio, todos os `vistoriadores` recebem uma notificação para atender ao pedido.
5.  **Vistoria e Seleção:** Um `vistoriador` atende ao chamado, analisa o pedido e seleciona uma viatura disponível no sistema para aquela missão. A viatura selecionada fica com o status "reservada".
6.  **Notificação ao Autorizador:** Com a viatura selecionada, todos os `autorizadores` são notificados para aprovar ou negar a solicitação.
7.  **Decisão do Autorizador:** Um `autorizador` aprova ou nega. Se negada, a viatura volta a ficar "disponível". Se aprovada, os `rádio-operadores` são notificados.
8.  **Liberação das Chaves:** Um `rádio-operador` entrega as chaves ao solicitante e marca a ação no bot.
9.  **Registro de KM:** O solicitante recebe a viatura e é instruído a informar a quilometragem **inicial**. A viatura passa para o status "em uso". Ao final da missão, o solicitante devolve a viatura e informa a quilometragem **final**.
10. **Finalização:** Com o KM final informado, a solicitação é concluída, a viatura volta ao status "disponível" e um resumo completo da missão é gerado para o solicitante.

## 👥 Perfis de Usuário e Permissões

As permissões são hierárquicas, ou seja, um usuário de nível superior tem acesso a todos os comandos dos níveis inferiores.

| Nível | Perfil | Responsabilidades e Comandos |
| :---: | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 4 | **Autorizador** | Aprova ou nega solicitações que já foram vistoriadas. |
| 3 | **Vistoriador** | Atende às solicitações, seleciona viaturas, cadastra novos veículos (`/addviatura`), lista todos os veículos (`/listviaturas`), atualiza o status de qualquer viatura (`/updatestatus`) e pode pré-cadastrar novos usuários no sistema (`/adduser`). |
| 2 | **Rádio-Operador** | Entrega as chaves das viaturas para solicitações já autorizadas e registra essa entrega no bot. |
| 1 | **Solicitante** | Inicia o bot (`/start`), solicita viaturas (`/solicitarviatura`), verifica o status de suas próprias solicitações (`/status`) e pede ajuda (`/help`). |

## 🚀 Comandos Disponíveis

| Comando | Descrição | Nível Mínimo |
| :--- | :--- | :--- |
| `/start` | Inicia a interação com o bot e mostra a mensagem de boas-vindas. | Solicitante |
| `/solicitarviatura` | Inicia o fluxo para solicitar uma nova viatura. | Solicitante |
| `/status` | Exibe o status das suas últimas solicitações. | Solicitante |
| `/help` | Mostra uma mensagem detalhada de ajuda. | Solicitante |
| `/adduser` | Inicia o fluxo para pré-cadastrar um novo usuário no sistema. | Vistoriador |
| `/addviatura` | Inicia o fluxo para cadastrar uma nova viatura na frota. | Vistoriador |
| `/listviaturas` | Lista todas as viaturas cadastradas e seus status atuais. | Vistoriador |
| `/updatestatus` | Permite alterar manualmente o status de uma viatura. | Vistoriador |
| `/debug`| Mostra informações de depuração sobre o usuário e o sistema. | Solicitante |

## 🛠️ Tecnologias Utilizadas

* **Plataforma:** Node.js
* **API Telegram:** `node-telegram-bot-api`
* **Banco de Dados:** MySQL (`mysql2/promise`)
* **Variáveis de Ambiente:** `dotenv`

## 📂 Estrutura do Projeto

```
/
├── controllers/
│   └── botHandlers.js      # Define todos os handlers para comandos e callbacks do bot.
├── services/
│   ├── authService.js        # Lógica de autenticação e gerenciamento de usuários.
│   ├── requestService.js     # Controla todo o fluxo de uma solicitação de viatura.
│   ├── statusService.js      # Lógica para atualização de status das viaturas.
│   └── vehicleService.js     # Lógica para o cadastro de novas viaturas.
├── .env                    # Arquivo local com as variáveis de ambiente (não versionado).
├── .gitignore              # Especifica arquivos e pastas a serem ignorados pelo Git.
├── config.js               # Carrega e exporta as configurações e variáveis de ambiente.
├── db.js                   # Gerencia a conexão com o banco de dados e exporta as queries.
├── main.js                 # Ponto de entrada da aplicação, inicializa o bot.
├── state.js                # (Deprecado/Refatorado) Gerenciador de estado inicial.
├── stateManager.js         # Gerenciador de estado moderno, usando DB para sessões.
└── utils.js                # Funções utilitárias (formatação, validação, permissões).
```

## ⚙️ Configuração e Instalação

1.  **Pré-requisitos:**
    * Node.js (v16 ou superior)
    * NPM
    * Um servidor de banco de dados MySQL.

2.  **Clonar o Repositório:**
    ```bash
    git clone https://URL-DO-SEU-REPOSITORIO.git
    cd nome-do-projeto
    ```

3.  **Instalar Dependências:**
    ```bash
    npm install
    ```

4.  **Configurar o Banco de Dados:**
    Execute o seguinte script SQL no seu banco de dados para criar as tabelas necessárias.

    ```sql
    CREATE TABLE usuarios (
        id INT AUTO_INCREMENT PRIMARY KEY,
        telegram_id VARCHAR(255) UNIQUE,
        nome VARCHAR(255),
        cpf VARCHAR(11) UNIQUE NOT NULL,
        matricula VARCHAR(50) UNIQUE NOT NULL,
        tipo_usuario ENUM('solicitante', 'radio_operador', 'vistoriador', 'autorizador') NOT NULL,
        ativo BOOLEAN DEFAULT TRUE,
        data_cadastro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE viaturas (
        id INT AUTO_INCREMENT PRIMARY KEY,
        prefixo VARCHAR(50) UNIQUE NOT NULL,
        nome VARCHAR(255) NOT NULL,
        modelo VARCHAR(100),
        placa VARCHAR(10) UNIQUE,
        km_atual INT DEFAULT 0,
        status ENUM('disponivel', 'cedida', 'baixada', 'disposicao', 'manutencao', 'reservada', 'em_uso') NOT NULL,
        data_cadastro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE logs_solicitacoes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        codigo_solicitacao VARCHAR(50) UNIQUE NOT NULL,
        solicitante_id VARCHAR(255),
        solicitante_nome VARCHAR(255),
        solicitante_cpf VARCHAR(11),
        solicitante_matricula VARCHAR(50),
        data_solicitacao DATETIME,
        data_necessidade DATETIME,
        motivo TEXT,
        status_final VARCHAR(50),
        viatura_id INT,
        viatura_prefixo VARCHAR(50),
        viatura_nome VARCHAR(255),
        viatura_placa VARCHAR(10),
        vistoriador_id VARCHAR(255),
        vistoriador_nome VARCHAR(255),
        data_vistoria DATETIME,
        autorizador_id VARCHAR(255),
        autorizador_nome VARCHAR(255),
        data_decisao DATETIME,
        radio_operador_id VARCHAR(255),
        radio_operador_nome VARCHAR(255),
        data_entrega DATETIME,
        km_inicial INT,
        km_final INT,
        observacoes TEXT,
        FOREIGN KEY (viatura_id) REFERENCES viaturas(id)
    );

    CREATE TABLE user_sessions (
        telegram_id VARCHAR(255) PRIMARY KEY,
        session_data JSON,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    );
    ```

5.  **Configurar Variáveis de Ambiente:**
    Crie um arquivo `.env` na raiz do projeto, copiando o conteúdo de um `.env.example` (se houver) ou usando o modelo abaixo.

    ```env
    # Token do seu bot, obtido com o @BotFather no Telegram
    TELEGRAM_BOT_TOKEN="SEU_TOKEN_AQUI"

    # Configurações do Banco de Dados
    DB_HOST="localhost"
    DB_USER="root"
    DB_PASSWORD="sua_senha_do_banco"
    DB_DATABASE="bot_viaturas"
    DB_PORT=3306

    # Configurações do Bot
    ANTECEDENCIA_MINIMA_MINUTOS=30
    ```

6.  **Povoar o Banco (Opcional, mas recomendado):**
    Para que o bot funcione, é preciso ter usuários pré-cadastrados. Um `vistoriador` pode usar o comando `/adduser`, mas para o primeiro `vistoriador`, você precisará inseri-lo manualmente no banco:
    ```sql
    INSERT INTO usuarios (cpf, matricula, tipo_usuario, ativo) VALUES ('11122233344', '12345', 'vistoriador', TRUE);
    ```
    Depois disso, o usuário correspondente a esse CPF/Matrícula pode fazer o primeiro acesso no bot para vincular seu Telegram e cadastrar outros usuários.

## ▶️ Como Executar

Após a configuração, inicie o bot com o seguinte comando:

```bash
node main.js
```

Ou, caso tenha o `nodemon` instalado para desenvolvimento:

```bash
nodemon main.js
```

---