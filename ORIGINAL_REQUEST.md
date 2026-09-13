# Original User Request

## Initial Request — 2026-09-13T03:09:22Z

Aplicativo web minimalista para corrida de rua integrado ao Google Maps / OpenStreetMap para planejamento de rotas (ponto inicial e final) e registro automático de treinos com sincronização Garmin Connect (OAuth/API simulada) e comparação gráfica entre rota planejada e traçado real.

Working directory: ~/teamwork_projects/garmin_running_tracker
Integrity mode: development

## Requirements

### R1. Interface de Mapa e Planejador de Rotas
- Acesso direto e limpo ao mapa (Google Maps com fallback automático para Leaflet/OpenStreetMap).
- Marcação intuitiva do Ponto A (Início) e Ponto B (Chegada) via busca de endereço ou clique direto no mapa.
- Cálculo automático da rota recomendada para corrida, exibição gráfica do traçado planejado e cálculo da distância estimada em km.

### R2. Sincronização Garmin Connect e Gravação de Corridas
- Módulo de conexão/autenticação Garmin Connect (com API/OAuth simulado e opção de importação de atividades).
- Leitura dos resultados da corrida: tempo total decorrido, distância real percorrida, ritmo médio (pace min/km) e coordenadas de GPS da atividade percorrida.
- Renderização visual sobreposta no mapa: exibir o traçado real percorrido pelo corredor (linha Garmin) sobreposto à rota originalmente planejada para comparação gráfica.

### R3. Histórico e Dashboard Minimalista
- Painel limpo e minimalista listando os treinos registrados com data, tempo total, ritmo (pace), distância e miniatura/mapa da rota percorrida.
- Indicador visual comparativo entre a distância planejada vs. distância real executada.

## Acceptance Criteria

### Interface & Mapa (R1)
- [ ] O mapa carrega imediatamente de forma responsiva permitindo alternar ou usar Google Maps / Leaflet.
- [ ] O usuário consegue selecionar Ponto de Início e Ponto de Chegada e ver a rota planejada desenhada no mapa com a distância em km.

### Sincronização & Comparação Visual (R2)
- [ ] O fluxo de sincronização Garmin lê os treinos registrados (tempo, pace, distância e coordenadas GPS).
- [ ] O caminho percorrido real vindo do Garmin é desenhado em cor destacada sobreposto à rota planejada no mapa.
- [ ] As estatísticas de tempo, pace e distância do relógio Garmin são salvas e exibidas corretamente.

### Histórico & Persistência (R3)
- [ ] Os treinos salvos permanecem armazenados e podem ser revisados no histórico com seu gráfico e métricas.
