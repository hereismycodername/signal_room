# Signal Room — план проектирования и разработки MVP

## 1. Решение в одном предложении

Signal Room — это сервис прогнозных комнат, в которых участники дают вероятностные прогнозы, а система после наступления результата рассчитывает точность и формирует проверяемую репутацию прогнозистов.

Ключевая идея: большинство показывает популярное мнение, а накопленная точность показывает, чьему мнению стоит доверять.

## 2. Цель хакатонного MVP

За один короткий сценарий пользователь должен увидеть полный цикл:

1. Организатор создаёт комнату и бинарный вопрос.
2. Участник подключает Solana-кошелёк и указывает вероятность от 0% до 100%.
3. Прогноз скрыт от остальных до закрытия вопроса и подписан участником.
4. После дедлайна система публикует распределение прогнозов.
5. Организатор фиксирует объективный результат со ссылкой на источник.
6. Система рассчитывает точность, обновляет leaderboard и даёт доказательство включения результата в onchain-root.

MVP должен доказывать три утверждения:

- прогноз существовал до дедлайна и не был изменён задним числом;
- результат вопроса после финализации нельзя переписать;
- репутация пользователя основана на проверяемой истории, а не на количестве подписчиков или громкости мнения.

## 3. Первый клиент

Первый узкий сегмент — криптосообщества, хакатоны, акселераторы и небольшие исследовательские команды.

Почему начинаем с них:

- участники уже пользуются кошельками;
- у организатора уже есть аудитория, поэтому продукт не требует пустого marketplace;
- вопросы и результаты можно распространять через X, Telegram и Discord;
- текущий хакатон можно использовать как первый публичный forecasting room.

Долгосрочно продукт может расшириться на продуктовые команды, инвестиционные сообщества и сравнение точности людей с AI-агентами.

## 4. Границы MVP

### Обязательно

- публичная landing page;
- Solana wallet sign-in;
- создание комнаты;
- создание бинарного вопроса с дедлайном и правилами разрешения;
- прогноз вероятности от 0 до 100;
- скрытие прогнозов до закрытия;
- криптографический commitment и подпись участника;
- агрегированный прогноз комнаты;
- ручное разрешение вопроса организатором со ссылкой на источник;
- детерминированный Brier score;
- профиль участника и leaderboard;
- фиксация commitments-root и results-root в Solana devnet;
- ссылки на транзакции в explorer;
- демонстрационные данные с несколькими завершёнными вопросами.

### После основного MVP

- приватные комнаты;
- email onboarding через embedded wallet;
- спонсорские USDC-награды;
- multiple-choice и числовые вопросы;
- комментарии и аргументация прогнозов;
- Discord/Telegram-боты;
- AI-прогнозисты;
- API и виджеты;
- автоматические источники результатов;
- mainnet.

### Не делаем на хакатоне

- ставки деньгами пользователей;
- токен Signal Room;
- AMM, order book или ликвидность;
- permissionless prediction market;
- собственный oracle network;
- полностью приватные/ZK-прогнозы;
- мобильное приложение;
- сложную DAO-модель;
- mainnet-деплой.

## 5. Роли и сценарии

### Организатор

1. Подключает кошелёк.
2. Создаёт комнату.
3. Создаёт вопрос, дедлайн и однозначные критерии результата.
4. При закрытии фиксирует Merkle-root подписанных commitments.
5. После наступления события выбирает итог `YES` или `NO` и добавляет источник.
6. Публикует results-root и получает итоговый leaderboard.

### Участник

1. Открывает комнату по ссылке.
2. Подключает кошелёк.
3. Выбирает вероятность с помощью slider или числового поля.
4. Подписывает canonical message без onchain-транзакции и комиссии.
5. Получает receipt с commitment hash.
6. После завершения видит точность, место и proof включения.

### Зритель

- может открыть публичную комнату без кошелька;
- видит завершённые вопросы, агрегаты и leaderboard;
- не может отправлять прогнозы без подтверждённой wallet-сессии.

## 6. Состояния вопроса

```text
DRAFT -> OPEN -> SEALED -> RESOLVED
```

- `DRAFT`: вопрос редактируется, прогнозы не принимаются.
- `OPEN`: прогнозы принимаются до `closes_at`.
- `SEALED`: приём остановлен, commitments-root зафиксирован; прогнозы раскрываются.
- `RESOLVED`: итог и results-root записаны; scores неизменяемы.

Запрещённые переходы:

- повторное открытие после `SEALED`;
- изменение commitments-root;
- разрешение вопроса до `SEALED`;
- повторное разрешение или изменение outcome;
- разрешение другим кошельком без authority.

## 7. Система прогнозов

На MVP поддерживаются только бинарные вопросы.

Пример:

> Выпустит ли проект публичный devnet до 12 октября, 18:00 UTC?

Участник отправляет вероятность в basis points:

- `0` = 0%;
- `5000` = 50%;
- `10000` = 100%.

Canonical commitment:

```text
SHA-256(
  version |
  room_address |
  question_id |
  participant_wallet |
  probability_bps |
  salt
)
```

Участник подписывает canonical message кошельком. Backend проверяет подпись и сохраняет прогноз. До закрытия API не отдаёт вероятность другим пользователям.

Ограничение MVP: оператор сервиса технически видит прогнозы в базе данных. Мы гарантируем отсутствие публичного herding и невозможность незаметно изменить подписанный прогноз, но не заявляем operator-blind privacy. Полная конфиденциальность — отдельная будущая задача.

## 8. Scoring

Для бинарных вопросов используется Brier score.

```text
error = probability - outcome
brier_loss = error²
score = 1 - brier_loss
```

Где probability и outcome нормализованы в диапазон `0..1`.

В интерфейсе score отображается как `0..10000`, чтобы расчёт можно было выполнять целыми числами:

```text
score_points = 10000 - ((probability_bps - outcome_bps)^2 / 10000)
```

Примеры:

- 100% и событие произошло: 10000;
- 50% при любом результате: 7500;
- 0% и событие произошло: 0.

Leaderboard показывает отдельно:

- средний score;
- число разрешённых прогнозов;
- процент попаданий в правильную сторону от 50%;
- текущую серию;
- статус `provisional`, пока нет трёх разрешённых прогнозов.

Это не позволяет человеку с одним удачным прогнозом сразу стать главным экспертом.

## 9. Архитектура

```text
Browser / Mobile Web
  |
  |-- Next.js 16 + React 19 UI
  |-- Wallet Standard / Solana wallet signer
  |-- client-side commitment creation
  |
Next.js server layer
  |-- nonce-based wallet authentication
  |-- room/question API
  |-- signature verification
  |-- aggregation and Brier scoring
  |-- Merkle tree/proof generation
  |
Relational database
  |-- users, rooms, questions, forecasts, scores
  |
Solana client (@solana/kit)
  |
Anchor program on localnet/devnet
  |-- Room PDA
  |-- Question PDA
  |-- commitments_root
  |-- immutable outcome + results_root
```

### Почему гибридная архитектура

Хранить каждый прогноз отдельным Solana-account дорого, медленно для UX и требует подписи транзакции на каждое действие. Хранить всё только в базе данных не даёт независимой проверяемости.

Поэтому:

- частые и приватные данные остаются offchain;
- подписи доказывают авторство прогнозов;
- Merkle-roots дешёво фиксируют целую пачку данных onchain;
- пользователь может проверить inclusion proof;
- состояние вопроса и итог после финализации неизменяемы.

## 10. Onchain-модель

### Room PDA

Seeds:

```text
["room", authority, room_id]
```

Поля:

- version;
- authority;
- room_id;
- metadata_hash;
- question_count;
- created_at;
- bump.

### Question PDA

Seeds:

```text
["question", room, question_index]
```

Поля:

- room;
- question_index;
- metadata_hash;
- closes_at;
- status;
- commitment_count;
- commitments_root;
- outcome;
- results_root;
- evidence_hash;
- sealed_at;
- resolved_at;
- bump.

### Инструкции Anchor

- `create_room(room_id, metadata_hash)`;
- `create_question(question_index, metadata_hash, closes_at)`;
- `seal_question(commitments_root, commitment_count)`;
- `resolve_question(outcome, results_root, evidence_hash)`.

На MVP программа не хранит пользовательские средства и не распределяет награды. Это сознательно уменьшает площадь атаки.

## 11. Offchain-модель данных

### users

- id;
- wallet_address, unique;
- display_name;
- avatar_seed;
- created_at.

### auth_nonces

- wallet_address;
- nonce_hash;
- expires_at;
- consumed_at.

### rooms

- id;
- slug, unique;
- owner_wallet;
- name;
- description;
- visibility;
- chain_address;
- metadata_hash;
- created_at.

### questions

- id;
- room_id;
- question_index;
- prompt;
- resolution_criteria;
- resolution_source_url;
- closes_at;
- status;
- outcome;
- chain_address;
- commitments_root;
- results_root;
- created_at;
- resolved_at.

### forecasts

- id;
- question_id;
- user_id;
- probability_bps;
- salt;
- commitment_hash;
- wallet_signature;
- submitted_at;
- revealed_at;
- unique `(question_id, user_id)`.

### scores

- id;
- forecast_id;
- score_points;
- direction_correct;
- merkle_leaf;
- merkle_proof;
- created_at.

Провайдер hosted database выбирается отдельно. Код должен зависеть от стандартного `DATABASE_URL`, чтобы не привязывать продуктовую логику к одному поставщику.

## 12. Wallet authentication

Авторизация не должна использовать подпись постоянной одинаковой строки.

Поток:

1. Сервер создаёт одноразовый nonce с коротким сроком жизни.
2. Клиент формирует сообщение с доменом, wallet address, nonce, issued-at и expiration.
3. Кошелёк подписывает сообщение.
4. Сервер проверяет подпись, домен, nonce и срок.
5. Nonce помечается использованным.
6. Сервер выдаёт `httpOnly`, `secure`, `sameSite=lax` session cookie.

Просмотр публичных результатов не требует авторизации.

## 13. Экранная структура

### `/`

- одна фраза о ценности;
- живой пример collective probability;
- кнопки `Explore a room` и `Create a room`;
- короткое объяснение `Predict -> Resolve -> Build reputation`.

### `/rooms/[slug]`

- название комнаты;
- активный вопрос;
- countdown;
- probability slider;
- submit/sign flow;
- receipt после отправки;
- завершённые вопросы;
- компактный leaderboard.

### `/rooms/[slug]/questions/[id]`

- полный вопрос и критерии разрешения;
- до закрытия: собственный прогноз, aggregate скрыт;
- после закрытия: histogram, median/mean, участники;
- после resolution: outcome, source, score, proof и explorer links.

### `/profile/[wallet]`

- aggregate score;
- количество прогнозов;
- калибровка;
- история результатов;
- onchain verification status.

### `/studio`

- создание комнаты;
- создание вопроса;
- seal/resolve actions;
- предупреждения о необратимых операциях.

## 14. Визуальное направление

Текущая dating-новелла полностью меняет смысл, но часть её наработок можно сохранить:

- live countdown;
- центральную интерактивную сцену;
- правую панель истории событий;
- анимацию выбора и раскрытия результата;
- трёхколоночный desktop layout.

Новое визуальное направление: editorial intelligence room, а не casino/trading terminal.

- спокойный тёмно-синий или графитовый фон;
- яркий signal-green для подтверждённых данных;
- probability slider как главный элемент;
- крупное число collective probability;
- визуализация расхождения мнений;
- минимальное количество криптожаргона;
- мобильная версия является обязательной.

## 15. Безопасность

### Главные угрозы

- replay wallet-signature;
- отправка прогноза после дедлайна;
- изменение прогноза задним числом;
- подделка адреса участника;
- изменение root после seal;
- resolution чужим кошельком;
- повторный resolve;
- несовпадение offchain и onchain данных;
- XSS через текст вопроса или display name;
- SSRF через resolution source URL;
- утечка неопубликованных прогнозов через API;
- злоупотребление endpoint создания прогнозов.

### Обязательные меры

- одноразовые auth nonce;
- canonical message serialization;
- server-side проверка подписи;
- серверная проверка дедлайна;
- строгая state machine в программе и backend;
- authority/signer/PDA/owner constraints;
- идемпотентные seal и resolve операции;
- лимиты запросов;
- output escaping;
- URL allow/validation без server-side fetch на MVP;
- deterministic Merkle leaf encoding;
- cross-check roots перед onchain-транзакцией;
- симуляция транзакции до отправки;
- devnet по умолчанию;
- Codex Security scan перед финальным релизом.

## 16. Тестирование

### Unit tests

- одинаковый canonical input создаёт одинаковый commitment;
- изменение одного поля меняет commitment;
- signature verification принимает владельца и отклоняет чужую подпись;
- Brier score: 0%, 50%, 100% и граничные значения;
- одинаковый список leaves создаёт одинаковый Merkle-root;
- inclusion proof проходит только для правильного leaf;
- переходы state machine.

### Anchor tests

- создание Room и Question PDA;
- запрет чужому authority создавать или финализировать question;
- запрет seal до дедлайна;
- успешный seal после time travel;
- невозможность повторно изменить root;
- невозможность resolve до seal;
- невозможность двойного resolve;
- корректная запись outcome и results-root.

### Integration tests

- Surfpool для localnet и time travel;
- Next backend создаёт root и вызывает программу;
- frontend читает состояние Question PDA;
- explorer URL соответствует выбранному cluster.

### E2E

- organizer создаёт комнату и вопрос;
- participant подписывает прогноз;
- до дедлайна aggregate скрыт;
- после seal прогноз раскрывается;
- после resolve появляется score;
- leaderboard обновляется;
- пользователь может проверить proof.

## 17. Метрики первого теста

До подачи стремимся получить:

- одну публичную комнату о Crypto World's Fair;
- не менее пяти вопросов, из них минимум три разрешённых;
- 20 реальных участников;
- 50 отправленных прогнозов;
- минимум пять вернувшихся участников;
- три коротких интервью с организаторами сообществ;
- список минимум из пяти проблем/замечаний пользователей.

Это тестовые цели, а не заявления о traction до их фактического достижения.

## 18. План по дням

Официальный deadline: 13 октября 2026 года, 06:59 UTC, то есть 11:59 по Алматы.

### 8 октября — проектирование и offchain vertical slice

- зафиксировать scope и тексты продукта;
- заменить dating-модель на Room/Question/Forecast;
- собрать landing и главный room screen;
- реализовать state machine и Brier score локально;
- добавить seed questions и завершённые demo results.

Критерий дня: полный сценарий работает локально на моковых данных.

### 9 октября — persistence и wallet identity

- добавить database schema;
- реализовать nonce + wallet sign-in;
- создать organizer studio;
- сохранять комнаты, вопросы и forecasts;
- скрывать aggregate до закрытия;
- добавить canonical commitment и signature verification.

Критерий дня: два разных кошелька могут отправить независимые прогнозы.

### 10 октября — Anchor program и localnet

- создать Anchor workspace;
- реализовать Room/Question PDA;
- реализовать create/seal/resolve;
- покрыть инструкции unit/integration tests;
- подключить Surfpool time travel;
- прогнать program autofixer.

Критерий дня: state machine полностью проходит тесты локально.

### 11 октября — devnet и Merkle verification

- интегрировать `@solana/kit`;
- подключить frontend к devnet;
- построить commitments/results Merkle-roots;
- записывать roots в Question PDA;
- добавить proof verification и explorer links;
- пройти весь сценарий на devnet.

Критерий дня: минимум один вопрос создан, sealed и resolved в devnet.

### 12 октября — реальные пользователи и стабилизация

- развернуть web-приложение;
- запустить публичную hackathon room;
- собрать первые прогнозы и обратную связь;
- исправить critical UX bugs;
- выполнить lint/build/tests;
- провести Codex Security scan;
- записать чистый demo flow без ручных обходов.

Критерий дня: незнакомый пользователь проходит сценарий без объяснений разработчика.

### 13 октября — подача

- оставить утро только на regression checks;
- проверить публичный URL, devnet accounts и explorer links;
- записать presentation video 2–3 минуты;
- записать product demo до 3 минут;
- подготовить архитектурную схему и traction evidence;
- завершить отправку с буфером до 11:59 по Алматы.

## 19. Приоритеты при нехватке времени

Срезаем в таком порядке:

1. профильная страница — leaderboard остаётся в комнате;
2. несколько комнат — оставляем одну public room и studio;
3. realtime updates — используем polling/refetch;
4. красивые графики — оставляем число, histogram и таблицу;
5. email onboarding;
6. reward pool.

Нельзя срезать:

- работающий прогноз;
- дедлайн и скрытие aggregate;
- scoring;
- onchain seal/resolve;
- explorer proof;
- понятное демо;
- тесты критической state machine.

## 20. Definition of Done

Проект готов к подаче, когда:

- production build проходит без ошибок;
- основной сценарий проходит на мобильном и desktop;
- вопрос нельзя изменить после seal;
- прогноз после дедлайна отклоняется и backend, и программой;
- score воспроизводим из опубликованных данных;
- commitments-root и results-root видны в devnet;
- нет mainnet-транзакций и пользовательских ставок;
- critical/high результаты security scan исправлены или явно объяснены;
- существует публичная комната с реальными прогнозами;
- demo занимает меньше трёх минут;
- презентация объясняет проблему до демонстрации технологии.

## 21. Демонстрационный сценарий

1. Открыть публичную комнату Crypto World's Fair.
2. Показать вопрос и критерии результата.
3. Подключить кошелёк и отправить прогноз 72%.
4. Показать signed receipt и отсутствие aggregate.
5. Переключиться на заранее подготовленный вопрос после seal.
6. Показать distribution и onchain commitments-root.
7. Разрешить вопрос или открыть уже resolved пример.
8. Показать Brier score, обновлённый leaderboard и Merkle proof.
9. Завершить фразой: Signal Room не спрашивает, кто говорит громче; он показывает, кто чаще оказывается прав.

## 22. Решения, которые нужно подтвердить перед кодом

1. Рабочее название остаётся `Signal Room` или используется временно?
2. Первый язык интерфейса: английский для судей или русский с английской версией?
3. Разработка ведётся одним человеком или командой?
4. Какой hosted database уже доступен команде?
5. Используем только injected Wallet Standard или сразу добавляем email onboarding через Phantom Connect?

Рекомендуемые ответы для текущего срока:

- название оставить временно;
- интерфейс делать на английском;
- архитектуру планировать так, чтобы один разработчик мог завершить MVP;
- использовать стандартный PostgreSQL через `DATABASE_URL`;
- начать с Wallet Standard, Phantom Connect оставить после core flow.

## 23. Источники и ограничения

- Colosseum рассматривает submission как стартап и оценивает insight, product execution, market, viability, communication и traction: https://colosseum.com/hackathon#h-faq-12
- Текущие ресурсы Solana-трека: https://colosseum.com/worldsfair/resources?track=solana
- В существующем репозитории используется Next.js 16.4, React 19.3 и TypeScript; Solana-интеграции пока нет.
- Перед изменением Next.js-кода необходимо читать документацию установленной версии из `node_modules/next/dist/docs/` согласно `AGENTS.md`.
