# ТЗ: подключение HTML5-игр в приложение StudyLine

**Объём работы: 1–2 дня.** Новая архитектура не нужна — это один экран с WebView.
Один раз подключаете контракт, дальше новые игры добавляются без изменений в коде приложения.

---

## 1. Что нужно сделать

1. Экран `GameScreen`, внутри — WebView на весь экран.
2. Открыть в нём ссылку на игру, передав данные ребёнка параметрами.
3. Принять от игры 4 типа сообщений и обработать их.
4. Отправить результат на бэкенд, где начисляется XP.

Игры лежат на GitHub Pages и обновляются без релиза приложения. Приложение просто открывает ссылку.

---

## 2. Как открыть игру

```
https://<аккаунт>.github.io/youngfuture-games/studyline/games/math_arcade.html
  ?uid=8421               // ID ребёнка в StudyLine (обязательно)
  &name=Алихан            // имя, для приветствия
  &cls=5                  // класс
  &sid=sess_abc123        // ID игровой сессии — выдаёт бэкенд перед запуском (обязательно)
  &lang=kk                // kk | ru
```

Все значения — через `encodeURIComponent` / URL-энкодинг.

**Про `sid`:** перед открытием игры приложение просит у бэкенда ID сессии. По нему бэкенд потом
поймёт, что результат относится к конкретному запуску, и не начислит XP дважды.
Без `sid` игра считает, что запущена вне приложения, и не покажет кнопку возврата.

### Настройки WebView (обязательно)
- JavaScript — включён
- DOM storage — включён
- Автовоспроизведение звука без жеста — разрешить (в играх есть звук)
- Зум и текстовое выделение — выключить
- Аппаратное ускорение — включено (игры рисуют на canvas)
- Кэш — включён, чтобы игра не качалась каждый раз заново

---

## 3. Что игра присылает

Все сообщения — JSON-строка одного формата:

```json
{
  "source": "studyline-game",
  "v": 1,
  "type": "finish",
  "game": "math_arcade",
  "sessionId": "sess_abc123",
  "userId": "8421",
  "ts": "2026-07-25T14:03:37.000Z",
  "payload": { }
}
```

Обрабатывать нужно `type`:

| type | Когда | Что делает приложение |
|---|---|---|
| `ready` | игра загрузилась | убрать свой лоадер |
| `progress` | по ходу игры (необязательно) | можно игнорировать |
| `finish` | **игра завершена** | отправить на бэкенд, показать «+XP» |
| `close` | ребёнок нажал «выйти» | закрыть экран игры |

**Проверять `source === "studyline-game"`** — всё остальное игнорировать.

### Содержимое `payload` у `finish`

```json
{
  "score": 42,
  "correct": 38,
  "mistakes": 4,
  "maxCombo": 11,
  "durationSec": 145,
  "difficulty": "medium",
  "details": { "learnedWords": 12 }
}
```

> ⚠️ **Игра НЕ присылает XP и не должна.** XP считает бэкенд по своим правилам.
> Так экономику XP можно менять через конфиг, не трогая игры и не выпуская новую версию приложения.

---

## 4. Код под ваш стек

### Flutter (`webview_flutter`)

```dart
WebViewController()
  ..setJavaScriptMode(JavaScriptMode.unrestricted)
  ..addJavaScriptChannel('StudyLine', onMessageReceived: (msg) {
      final data = jsonDecode(msg.message);
      if (data['source'] != 'studyline-game') return;
      handleGameMessage(data);
    })
  ..loadRequest(Uri.parse(gameUrl));
```

Отправить команду в игру:
```dart
controller.runJavaScript(
  'window.StudyLine._receive(${jsonEncode(jsonEncode({"type": "pause"}))})');
```

### React Native (`react-native-webview`)

```jsx
<WebView
  source={{ uri: gameUrl }}
  javaScriptEnabled
  domStorageEnabled
  mediaPlaybackRequiresUserAction={false}
  onMessage={(event) => {
    const data = JSON.parse(event.nativeEvent.data);
    if (data.source !== 'studyline-game') return;
    handleGameMessage(data);
  }}
/>
```

Отправить команду в игру:
```js
webviewRef.current.injectJavaScript(
  `window.StudyLine._receive('{"type":"pause"}'); true;`);
```

### Android (нативно)

Игра ищет объект с именем **`StudyLineAndroid`** и методом `postMessage`:

```kotlin
webView.settings.javaScriptEnabled = true
webView.settings.domStorageEnabled = true
webView.settings.mediaPlaybackRequiresUserGesture = false

webView.addJavascriptInterface(object {
    @JavascriptInterface
    fun postMessage(json: String) {
        val data = JSONObject(json)
        if (data.getString("source") != "studyline-game") return
        runOnUiThread { handleGameMessage(data) }
    }
}, "StudyLineAndroid")

webView.loadUrl(gameUrl)
```

Отправить команду в игру:
```kotlin
webView.evaluateJavascript("window.StudyLine._receive('{\"type\":\"pause\"}')", null)
```

### iOS (нативно, `WKWebView`)

Игра ищет обработчик с именем **`StudyLine`**:

```swift
let config = WKWebViewConfiguration()
config.userContentController.add(self, name: "StudyLine")
config.allowsInlineMediaPlayback = true
config.mediaTypesRequiringUserActionForPlayback = []

// В делегате:
func userContentController(_ c: WKUserContentController,
                           didReceive message: WKScriptMessage) {
    guard let json = message.body as? String,
          let data = try? JSONSerialization.jsonObject(with: Data(json.utf8)) as? [String: Any],
          data["source"] as? String == "studyline-game" else { return }
    handleGameMessage(data)
}
```

Отправить команду в игру:
```swift
webView.evaluateJavaScript("window.StudyLine._receive('{\"type\":\"pause\"}')")
```

---

## 5. Что делает бэкенд

**Перед игрой** — выдать `sid`:
```
POST /api/games/session
  { userId, game }
→ { sessionId }
```

**После игры** — принять результат и начислить XP:
```
POST /api/games/result
  { sessionId, userId, game, score, correct, mistakes, durationSec, difficulty, details }
→ { xpAwarded: 120, totalXp: 3480 }
```

Бэкенд обязан:
1. **Считать XP сам**, по конфигу (не доверять клиенту).
2. **Проверить `sessionId`** — существует, принадлежит этому ребёнку, ещё не закрыт.
3. **Начислить один раз** на сессию (повторный `finish` игнорировать).
4. **Ограничить сверху**: максимум XP за игру в день — иначе ребёнок будет фармить.
5. **Проверить правдоподобность**: `durationSec` слишком мал для такого `score` → не начислять, залогировать.
6. Прокинуть XP дальше — в кланы и в недельный уровень мамы.

Приложение после ответа показывает «+120 XP ⭐».

---

## 6. Крайние случаи

| Ситуация | Что делать |
|---|---|
| Нет интернета при открытии | Показать экран «Ойын жүктелмеді. Интернетті тексер» + кнопку «Қайталау» |
| Игра не прислала `ready` за 15 сек | Показать тот же экран ошибки |
| `finish` не дошёл до бэкенда | Сохранить локально и отправить при следующем запуске |
| Входящий звонок / приложение свернули | Отправить в игру `pause`, при возврате — `resume` |
| Ребёнок нажал системную «назад» | Закрыть экран. Результат за незавершённую игру не начисляется |

---

## 7. Проверка перед сдачей

- [ ] Игра открывается и присылает `ready`
- [ ] Ребёнок **не видит формы входа** (имя приходит из приложения — на экране должно быть его имя)
- [ ] После завершения приходит `finish` с непустым `payload`
- [ ] XP начислен на бэкенде и виден в приложении
- [ ] Повторная отправка того же `sessionId` **не начисляет XP второй раз**
- [ ] Кнопка «← Қосымшаға оралу» закрывает экран
- [ ] Звук работает; при сворачивании приложения — замолкает
- [ ] Нет зума по двойному тапу и выделения текста
- [ ] Работает на слабом интернете и на дешёвом Android

---

## 8. Как проверить без приложения

В репозитории есть симулятор — он ведёт себя как приложение и показывает все сообщения:

```
studyline/test/simulator.html
```

Запустить локально:
```bash
cd studyline && python3 -m http.server 8777
# открыть http://localhost:8777/test/simulator.html
```

---

## 9. Структура файлов

```
studyline/
  bridge/studyline-bridge.js   ← контракт, подключается в каждую игру одной строкой
  games/math_arcade.html       ← эталонная игра (по ней делаются остальные)
  test/simulator.html          ← симулятор приложения для проверки
  ТЗ_WebView_разработчикам.md  ← этот файл
```

**Чтобы подключить новую игру** — в её `<head>` добавить:
```html
<script src="../bridge/studyline-bridge.js"></script>
```
и вызвать `SL.init({game:'имя'})`, `SL.ready()`, `SL.finish({...})`.
Со стороны приложения менять ничего не нужно.
