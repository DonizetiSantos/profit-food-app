# Profit Food V3 - Controle Financeiro Inteligente

## Integração Supabase

Este projeto agora utiliza **Supabase** para persistência de dados em nuvem, com fallback automático para **LocalStorage**.

### Configuração do Supabase

1.  **SQL Schema**:
    -   Acesse o [Supabase Dashboard](https://supabase.com/dashboard).
    -   Vá em **SQL Editor**.
    -   Clique em **New Query**.
    -   Cole o conteúdo do arquivo `supabase/schema.sql` e execute.

2.  **Variáveis de Ambiente**:
    -   As credenciais já estão configuradas no projeto em `src/lib/supabaseClient.ts`.
    -   Para produção ou novos projetos, defina as seguintes variáveis no seu ambiente (ou arquivo `.env`):
        -   `VITE_SUPABASE_URL`: URL do seu projeto Supabase.
        -   `VITE_SUPABASE_ANON_KEY`: Chave anônima (anon key) do seu projeto.

### Migração e Sincronização

-   **Sincronização Automática**: O aplicativo agora sincroniza automaticamente cada alteração (criação, edição ou exclusão) diretamente com o Supabase.
-   **Sincronizar Tudo**: Na aba **Cadastros**, o botão **Sincronizar Tudo (Supabase)** permite subir um arquivo de backup JSON completo para o banco de dados, útil para migrações iniciais.
-   **Fallback Local**: Todas as operações continuam sendo salvas no LocalStorage para garantir o funcionamento offline.

### Conciliação Bancária (OFX)

A estrutura para conciliação bancária já está preparada no banco de dados e no código:
-   **Tabelas**: `bank_transactions`, `reconciliations` e `ofx_imports`.
-   **Menu**: Uma nova aba **Conciliação** foi adicionada para gerenciar os extratos.
-   **Services**: O arquivo `src/services/reconciliationService.ts` contém os métodos necessários para listar e vincular transações.

### Como Testar a Persistência
1.  Crie um novo lançamento na aba **Lançamentos**.
2.  Verifique o console do navegador para logs de sucesso do DataStore.
3.  Recarregue a página (F5).
4.  O lançamento deve permanecer visível, tendo sido carregado diretamente do Supabase.
