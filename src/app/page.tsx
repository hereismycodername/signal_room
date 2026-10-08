"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";

type CharacterId = "alina" | "mira" | "max";

type Character = {
  id: CharacterId;
  name: string;
  age: number;
  role: string;
  tagline: string;
  initials: string;
  color: string;
};

type Choice = {
  id: string;
  text: string;
  tone: string;
  votes: number;
  affection: number;
  response: string;
};

type Scene = {
  chapter: string;
  place: string;
  time: string;
  characterId: CharacterId;
  narration: string;
  line: string;
  choices: Choice[];
};

type RoundResult = {
  winner: Choice;
  wasTie: boolean;
  tiedCount: number;
};

const CHARACTERS: Character[] = [
  {
    id: "alina",
    name: "Алина Соколова",
    age: 27,
    role: "Продуктовый дизайнер",
    tagline: "Сохраняет мемы по папкам и считает это системой.",
    initials: "АС",
    color: "#ff6f61",
  },
  {
    id: "mira",
    name: "Мира Ким",
    age: 26,
    role: "Фотограф",
    tagline: "Сначала фотографирует еду. Потом разрешает её есть.",
    initials: "МК",
    color: "#6c8cff",
  },
  {
    id: "max",
    name: "Макс Орлов",
    age: 29,
    role: "Мобильный разработчик",
    tagline: "Открыто 48 вкладок. В жизни примерно так же.",
    initials: "МО",
    color: "#22b894",
  },
];

const SCENES: Scene[] = [
  {
    chapter: "СВИДАНИЕ 01",
    place: "Кофейня у метро",
    time: "19:08",
    characterId: "alina",
    narration: "Алина опоздала на семь минут и принесла вам печенье в качестве официальной компенсации.",
    line: "У тебя есть привычка, которая раздражает вообще всех?",
    choices: [
      {
        id: "alarm",
        text: "Я ставлю пять будильников и торгуюсь с каждым.",
        tone: "честно",
        votes: 14,
        affection: 10,
        response: "Алина смеётся: у неё семь будильников. Вы неожиданно нашли совместимость в хроническом недосыпе.",
      },
      {
        id: "memes",
        text: "Отвечаю на серьёзные сообщения мемами.",
        tone: "рискованно",
        votes: 14,
        affection: 14,
        response: "Она достаёт телефон и показывает папку «Мемы для серьёзных разговоров». Кажется, это судьба.",
      },
      {
        id: "ghost",
        text: "Говорю «давай созвонимся» и исчезаю на неделю.",
        tone: "слишком честно",
        votes: 7,
        affection: -12,
        response: "Алина молча добавляет вас в календарь. Событие называется «не созваниваться».",
      },
    ],
  },
  {
    chapter: "СВИДАНИЕ 02",
    place: "Небольшой книжный магазин",
    time: "16:42",
    characterId: "mira",
    narration: "Мира уже успела сфотографировать витрину, кассира и вашу попытку выглядеть естественно.",
    line: "Выбери мне книгу, не спрашивая, что я люблю читать.",
    choices: [
      {
        id: "favorite",
        text: "Беру свою любимую и пишу внутри короткую записку.",
        tone: "тепло",
        votes: 17,
        affection: 13,
        response: "Мира читает записку дважды и прячет книгу в сумку. Фото этой сцены почему-то не требуется.",
      },
      {
        id: "cover",
        text: "Выбираю самую красивую обложку. Метод научный.",
        tone: "легкомысленно",
        votes: 11,
        affection: 6,
        response: "Книга оказывается справочником по ремонту тракторов. Мира говорит, что давно хотела новое хобби.",
      },
      {
        id: "psychology",
        text: "Дарю «Как разбираться в людях за пять минут».",
        tone: "опасно",
        votes: 6,
        affection: -11,
        response: "Мира смотрит на вас ровно пять минут. Затем ставит книгу обратно на полку.",
      },
    ],
  },
  {
    chapter: "СВИДАНИЕ 03",
    place: "Супермаркет возле дома",
    time: "20:16",
    characterId: "max",
    narration: "Ресторан отменил бронь. Макс объявил продуктовый магазин «неожиданным кулинарным квестом».",
    line: "У нас один пакет, ограниченный бюджет и ужин через час. План?",
    choices: [
      {
        id: "pasta",
        text: "Готовим пасту вместе. Я отвечаю за музыку.",
        tone: "уютно",
        votes: 16,
        affection: 13,
        response: "Макс добавляет в корзину пасту и нелепо дорогой сыр. Плейлист уже называется «второе свидание».",
      },
      {
        id: "breakfast",
        text: "Покупаем хлопья. Ужин — это социальный конструкт.",
        tone: "практично",
        votes: 9,
        affection: 7,
        response: "Макс серьёзно сравнивает состав двух коробок. Вы проходите проверку на бытовую совместимость.",
      },
      {
        id: "delivery",
        text: "Заказываем доставку прямо из супермаркета.",
        tone: "хаос",
        votes: 16,
        affection: -8,
        response: "Курьер звонит, пока вы стоите у кассы. Макс уважает абсурд, но не бизнес-модель.",
      },
    ],
  },
];

const START_CHEMISTRY: Record<CharacterId, number> = { alina: 32, mira: 29, max: 31 };
const clamp = (value: number) => Math.min(100, Math.max(0, value));

function randomInt(max: number) {
  const value = new Uint32Array(1);
  window.crypto.getRandomValues(value);
  return value[0] % max;
}

export default function Home() {
  const [sceneIndex, setSceneIndex] = useState(0);
  const [choices, setChoices] = useState(SCENES[0].choices);
  const [chemistry, setChemistry] = useState(START_CHEMISTRY);
  const [selected, setSelected] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(25);
  const [result, setResult] = useState<RoundResult | null>(null);
  const [episodeComplete, setEpisodeComplete] = useState(false);
  const [storyLog, setStoryLog] = useState([
    "Зрители получили контроль над вашей личной жизнью.",
    "Первое свидание началось. Пути назад почти нет.",
  ]);

  const scene = SCENES[sceneIndex];
  const character = CHARACTERS.find((item) => item.id === scene.characterId)!;
  const totalVotes = choices.reduce((sum, choice) => sum + choice.votes, 0);
  const currentChemistry = chemistry[character.id];
  const favorite = useMemo(
    () => [...CHARACTERS].sort((a, b) => chemistry[b.id] - chemistry[a.id])[0],
    [chemistry],
  );

  const resolveRound = useCallback(() => {
    if (result) return;
    const maxVotes = Math.max(...choices.map((choice) => choice.votes));
    const tied = choices.filter((choice) => choice.votes === maxVotes);
    const winner = tied[randomInt(tied.length)];
    const wasTie = tied.length > 1;

    setChemistry((values) => ({
      ...values,
      [scene.characterId]: clamp(values[scene.characterId] + winner.affection),
    }));
    setStoryLog((entries) => [
      wasTie
        ? `Ничья ×${tied.length}. Случайно выбрано: «${winner.text}»`
        : `Большинство выбрало: «${winner.text}»`,
      ...entries,
    ]);
    setResult({ winner, wasTie, tiedCount: tied.length });
  }, [choices, result, scene.characterId]);

  useEffect(() => {
    if (result || episodeComplete) return;
    const timer = window.setTimeout(() => {
      if (seconds <= 1) resolveRound();
      else setSeconds((value) => value - 1);
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [seconds, result, episodeComplete, resolveRound]);

  function castVote(id: string) {
    if (selected || result) return;
    setSelected(id);
    setChoices((items) => items.map((choice) => choice.id === id ? { ...choice, votes: choice.votes + 1 } : choice));
  }

  function nextScene() {
    if (!result) return;
    if (sceneIndex === SCENES.length - 1) {
      setEpisodeComplete(true);
      return;
    }
    const nextIndex = sceneIndex + 1;
    setSceneIndex(nextIndex);
    setChoices(SCENES[nextIndex].choices);
    setSelected(null);
    setResult(null);
    setSeconds(25);
  }

  function restartEpisode() {
    setSceneIndex(0);
    setChoices(SCENES[0].choices);
    setChemistry(START_CHEMISTRY);
    setSelected(null);
    setResult(null);
    setSeconds(25);
    setEpisodeComplete(false);
    setStoryLog(["Новый эпизод. Зрители обещали давать зрелые советы.", "Никто им не поверил."]);
  }

  const characterStyle = { "--character-color": character.color } as CSSProperties;

  return (
    <main className="novel-shell">
      <header className="novel-topbar">
        <div className="logo-lockup">
          <span className="heart-logo">♥</span>
          <div><p>PROJECT: UNTITLED</p><small>КОЛЛЕКТИВНАЯ ИСТОРИЯ ЗНАКОМСТВ</small></div>
        </div>
        <div className="live-badge"><i /> LIVE · {totalVotes} ЗРИТЕЛЕЙ</div>
      </header>

      <section className="novel-grid">
        <aside className="cast-panel novel-panel">
          <div className="section-label"><span>ГЕРОИ</span><span>ЭПИЗОД 01</span></div>
          <p className="panel-intro">Три знакомства, один главный герой и слишком много советчиков.</p>
          <div className="cast-list">
            {CHARACTERS.map((item) => {
              const active = item.id === character.id && !episodeComplete;
              const style = { "--character-color": item.color } as CSSProperties;
              return (
                <article className={`cast-card ${active ? "active" : ""}`} key={item.id} style={style}>
                  <span className="mini-avatar">{item.initials}</span>
                  <div className="cast-copy">
                    <strong>{item.name}, {item.age}</strong>
                    <small>{item.role}</small>
                    <div className="love-meter"><span style={{ width: `${chemistry[item.id]}%` }} /></div>
                    <p><b>{chemistry[item.id]}%</b> химия</p>
                  </div>
                </article>
              );
            })}
          </div>
          <div className="rule-card">
            <strong>ПРАВИЛА ЭПИЗОДА</strong>
            <ol>
              <li>Каждый зритель выбирает одну реплику.</li>
              <li>Побеждает вариант с большинством голосов.</li>
              <li>При ничьей случайно выбирается один из лидеров.</li>
            </ol>
          </div>
        </aside>

        <section className="story-panel novel-panel">
          {episodeComplete ? (
            <div className="finale">
              <p className="chapter-label">ЭПИЗОД ЗАВЕРШЁН</p>
              <div className="finale-heart">♥</div>
              <h1>Кажется, мэтч случился.</h1>
              <p>Лучшая химия — с персонажем <strong>{favorite.name}</strong>: {chemistry[favorite.id]}%.</p>
              <div className="finale-card" style={{ "--character-color": favorite.color } as CSSProperties}>
                <span>{favorite.initials}</span><div><small>{favorite.role}</small><strong>{favorite.name}</strong></div>
              </div>
              <button className="primary-button" type="button" onClick={restartEpisode}>ПЕРЕИГРАТЬ ЭПИЗОД</button>
            </div>
          ) : (
            <>
              <div className={`date-scene scene-${character.id}`} style={characterStyle}>
                <div className="scene-heading">
                  <div><p className="chapter-label">{scene.chapter}</p><strong>{scene.place}</strong></div>
                  <span>{scene.time}</span>
                </div>
                <div className="city-window" aria-hidden="true"><i /><i /><i /><i /></div>
                <div className="character-portrait">
                  <span className="portrait-initials">{character.initials}</span>
                  <i className="portrait-head" /><i className="portrait-body" />
                </div>
                <p className="narrator-line">{scene.narration}</p>
                <div className="dialogue-box">
                  <span className="speaker-name">{character.name}</span>
                  <p>«{scene.line}»</p>
                </div>
              </div>

              {result ? (
                <div className={`result-card ${result.winner.affection < 0 ? "bad" : "good"}`}>
                  <div className="result-meta">
                    <span>{result.wasTie ? `НИЧЬЯ ×${result.tiedCount} · СЛУЧАЙНЫЙ ВЫБОР` : "ВЫБОР БОЛЬШИНСТВА"}</span>
                    <b>{result.winner.affection > 0 ? "+" : ""}{result.winner.affection}% ♥</b>
                  </div>
                  <h2>{result.winner.text}</h2>
                  <p>{result.winner.response}</p>
                  <button className="primary-button" type="button" onClick={nextScene}>{sceneIndex === SCENES.length - 1 ? "УЗНАТЬ ИТОГ ЭПИЗОДА" : "СЛЕДУЮЩЕЕ СВИДАНИЕ →"}</button>
                </div>
              ) : (
                <div className="voting-block">
                  <div className="voting-title"><div><span>РЕШАЮТ ЗРИТЕЛИ</span><h2>Что ответить?</h2></div><time>00:{String(seconds).padStart(2, "0")}</time></div>
                  <div className="answers">
                    {choices.map((choice, index) => {
                      const percent = Math.round((choice.votes / totalVotes) * 100);
                      return (
                        <button className={`answer ${selected === choice.id ? "selected" : ""}`} disabled={selected !== null} key={choice.id} onClick={() => castVote(choice.id)} type="button">
                          <span className="answer-key">{String.fromCharCode(65 + index)}</span>
                          <span className="answer-text"><strong>{choice.text}</strong><small>{choice.tone}</small></span>
                          <span className="vote-count"><b>{percent}%</b><small>{choice.votes} голосов</small></span>
                          <i className="vote-fill" style={{ width: `${percent}%` }} />
                        </button>
                      );
                    })}
                  </div>
                  <button className="resolve-now" type="button" onClick={resolveRound}>ЗАВЕРШИТЬ ГОЛОСОВАНИЕ СЕЙЧАС</button>
                  <p className="vote-note">{selected ? "Ваш голос добавлен. Теперь остаётся смотреть на последствия." : "Один зритель — один голос. Передумать нельзя, как и после странного сообщения в 2:00."}</p>
                </div>
              )}
            </>
          )}
        </section>

        <aside className="audience-panel novel-panel">
          <div className="section-label"><span>ПРЯМОЙ ЭФИР</span><span>СЦЕНА {sceneIndex + 1}/3</span></div>
          <div className="current-score">
            <p>ТЕКУЩАЯ ХИМИЯ</p><strong style={{ color: character.color }}>{currentChemistry}%</strong><span>с {character.name}</span>
          </div>
          <div className="profile-note"><span>СЕГОДНЯ</span><p>{character.tagline}</p></div>
          <div className="story-log" aria-live="polite">
            {storyLog.slice(0, 5).map((entry, index) => <div className="log-line" key={`${entry}-${index}`}><span>{String(storyLog.length - index).padStart(2, "0")}</span><p>{entry}</p></div>)}
          </div>
          <div className="onchain-note"><span>◇</span><div><strong>ПОЗЖЕ НА SOLANA</strong><p>Коллективный выбор и итог эпизода можно сделать публичными и проверяемыми.</p></div></div>
        </aside>
      </section>

      <footer className="novel-footer"><span>ПРОТОТИП · ТОЛЬКО ВЫМЫШЛЕННЫЕ ВЗРОСЛЫЕ ПЕРСОНАЖИ</span><span>ОДНО СВИДАНИЕ · МНОГО МНЕНИЙ</span></footer>
    </main>
  );
}
