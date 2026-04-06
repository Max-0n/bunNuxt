type StartArg = { firstName: string }

const Start = {
  en: (_arg: StartArg) => `Play Hamster Gamedev - top-1 business simulator in Telegram!`,
  ru: (_arg: StartArg) => `Играй в Хамстер Геймдев - лучший симулятор в Телеграмме!`,
  latam: (_arg: StartArg) => `¡Construyamos el mejor estudio de desarrollo de juegos! No dejes que otros ganen`,
  uz: (_arg: StartArg) => `TOP o'yin ishlab chiqish studiyasini quramiz! Boshqalar g'alaba qozonishiga yo'l qo'ymang`,
  vn: (_arg: StartArg) => `Hãy xây dựng studio phát triển game hàng đầu! Đừng để người khác chiến thắng`,
  br: (_arg: StartArg) => `Vamos construir o melhor estúdio de desenvolvimento de jogos! Não deixe os outros vencerem`,
}
const StartCbt = Start

// ------------------------ //

type RefArg = { firstName: string; referrerName: string; welcomeBonus: number }
const Referral = {
  en: (_arg: RefArg) => `Say thank you to ${_arg.referrerName} and claim your gift — ${_arg.welcomeBonus} coins 😌`,
  ru: (_arg: RefArg) => `Скажи спасибо ${_arg.referrerName} и забирай свой подарок — ${_arg.welcomeBonus} монет 😌`,
  latam: (_arg: RefArg) => `Dile gracias a ${_arg.referrerName} y reclama tu regalo — ${_arg.welcomeBonus} monedas 😌`,
  uz: (_arg: RefArg) =>
    `${_arg.referrerName}’ga rahmat ayting va sovg‘angizni qabul qiling — ${_arg.welcomeBonus} tanga 😌`,
  vn: (_arg: RefArg) => `Hãy cảm ơn ${_arg.referrerName} và nhận món quà của bạn — ${_arg.welcomeBonus} xu 😌`,
  br: (_arg: RefArg) => `Agradeça ao ${_arg.referrerName} e aceite seu presente — ${_arg.welcomeBonus} moedas 😌`,
}

// ---------- //

const RefLink_Ru = (_arg: { refLink: string }) =>
  `Приглашай своих друзей и получай бонусы за каждого, кто зарегистрируется 🎁

Твоя реферальная ссылка: ${_arg.refLink}`

const RefLink_En = (_arg: { refLink: string }) =>
  `Invite friends and get bonuses for everyone who signs up 🎁

Your referral link: ${_arg.refLink}`

const RefLink_Latam = (_arg: { refLink: string }) =>
  `Invita a tus amigos y obtendrás tanto tú como tus amigos bonificaciones al registrarse.

Tu enlace de referido:  ${_arg.refLink}`

const RefLink_Uz = (_arg: { refLink: string }) =>
  `Do'stlaringizni taklif qiling va ro'yxatdan o'tgan har bir kishi uchun bonuslarga ega bo'ling 🎁

Sizning havolangiz: ${_arg.refLink}`

const RefLink_Vn = (_arg: { refLink: string }) =>
  `Mời bạn bè và nhận tiền thưởng từ những người đăng ký 🎁

Link giới thiệu của bạn: ${_arg.refLink}`

const RefLink_Br = (_arg: { refLink: string }) =>
  `Convide amigos e receba bónus para todos os que se inscreverem

O seu link de referência: ${_arg.refLink}`

const RefLink = {
  ru: RefLink_Ru,
  en: RefLink_En,
  latam: RefLink_Latam,
  uz: RefLink_Uz,
  vn: RefLink_Vn,
  br: RefLink_Br,
}

// ------------------------ //

const HowToEarn_Ru = (_arg: { guideLink: string }) =>
  `Как играть в Hamster Kombat ⚡️
  
[Полная версия гайда.](${_arg.guideLink})

💰 Tap to earn
Тапай по экрану и собирай монеты 

⛏ Mine
Прокачивай карточки, которые дадут возможность пассивного дохода.

⏰ Прибыль в час
Биржа будет работать для тебя самостоятельно, даже когда ты не в игре в течение 3х часов. 
Далее нужно будет перезайти в игру снова. 

📈 LVL
Чем больше монет у тебя на балансе — тем выше уровень биржи. Чем выше уровень — тем быстрее сможешь зарабатывать ещё больше монет 

👥 Friends
Приглашай своих друзей, и вы получите бонусы. Помоги другу перейти в следующие лиги, и вы получите ещё больше бонусов.

🪙 Token listing
По итогам сезона будет выпущен токен, который будет распределен между игроками. 
Даты сообщим в нашем анонс-канале. Следите за новостями!

/help чтобы получить этот гайд`

const HowToEarn_En = (_arg: { guideLink: string }) =>
  `How to play Hamster Kombat ⚡️

[Full version of the guide.](${_arg.guideLink})

💰 Tap to earn
Tap the screen and collect coins.

⛏ Mine
Upgrade cards that will give you passive income opportunities.

⏰ Profit per hour
The exchange will work for you on its own, even when you are not in the game for 3 hours.
Then you need to log in to the game again.

📈 LVL
The more coins you have on your balance, the higher the level of your exchange is and the faster you can earn more coins.

👥 Friends
Invite your friends and you’ll get bonuses. Help a friend move to the next leagues and you'll get even more bonuses.

🪙 Token listing
At the end of the season, a token will be released and distributed among the players.
Dates will be announced in our announcement channel. Stay tuned!

/help to get this guide`

const HowToEarn_Latam = (_arg: { guideLink: string }) =>
  `Cómo jugar a Hamster Kombat ⚡️

[Versión completa de la guía.](${_arg.guideLink})

💰Toca para ganar
Toca en la pantalla y colecciona monedas 

⛏Mine.
Pasa tarjetas que te darán oportunidades de ingresos pasivos.

⏰ Ganancia por hora.
La bolsa trabajará para ti por sí sola, incluso cuando no estés en el juego durante 3 horas. Después tendrás que volver a entrar en el juego de nuevo.

📈Nivel
Cuantas más monedas tengas en tu saldo, mayor será el nivel del exchange. Cuanto más alto sea el nivel, más rápido podrás ganar más monedas. 

👥Amigos
Invita a tus amigos y conseguirás bonificaciones. Ayuda a un amigo a avanzar a las siguientes ligas y conseguirás aún más bonificaciones y beneficios.

🪙 Listado de fichas
Al final de la temporada se liberará un token que se repartirá entre los jugadores. Las fechas se anunciarán en nuestro canal de anuncios. ¡Estén atentos!

/help para conseguir esta guía`

const HowToEarn_Uz = (_arg: { guideLink: string }) =>
  `[Qo'llanmaning to'liq versiyasi.](${_arg.guideLink})

💰Tangalar uchun bosing
Ekranga teging va tangalarni to'plang

⛏Qazish
Passiv daromad olish imkoniyatini beradigan kartalarni yangilang.

⏰Soatlik foyda
O'yinda 3 soat bo'lmaganingizda ham kartalar siz uchun mustaqil ishlaydi. Keyin yana o'yinga kirishingiz kerak bo'lad

📈LVL
Sizning balansingizda qancha tangalar bo'lsa - almashinuv darajasi shunchalik yuqori bo'ladi. Daraja qanchalik baland bo'lsa, shunchalik tez ko'proq tanga olishingiz mumkin.


👥Do'stlar
Do'stlaringizni taklif qiling va bonuslarga ega bo'ling. Do'stingizga keyingi ligaga chiqishi uchun yordam bering va siz yanada ko'proq bonuslarga ega bo'lasiz.


🪙 Token listing
Mavsum oxirida token chiqariladi va o'yinchilar o'rtasida taqsimlanadi. Sanalar kanalimizda e'lon qilinadi. Yangiliklarni kuzatib va xabardor bo'ling. Biz bilan qoling!`

const HowToEarn_Vn = (_arg: { guideLink: string }) =>
  `[Phiên bản đầy đủ của hướng dẫn.](${_arg.guideLink})

💰Nhấn để kiếm xu
Chạm vào màn hình và thu thập tiền xu

⛏Mine
Nâng cấp thẻ sẽ mang lại cho bạn cơ hội thu nhập thụ động.

⏰Lợi nhuận mỗi giờ.
Việc trao đổi sẽ tự thực hiện cho bạn, ngay cả khi bạn không tham gia trò chơi trong 3 giờ.  Sau đó, bạn sẽ cần phải vào lại trò chơi một lần nữa để nhận xu.

📈LVL
Bạn càng có nhiều xu trong tài khoản - cấp độ sàn giao dịch càng cao.  Cấp độ sàn giao dịch càng cao, bạn càng có thể kiếm được nhiều xu hơn.

👥Bạn bè
Mời bạn bè của bạn và bạn sẽ nhận được tiền thưởng.  Giúp một người bạn tiến tới cấp độ cao hơn và bạn sẽ nhận được nhiều tiền thưởng hơn nữa.

🪙 Niêm yết token
Sau cùng, Token sẽ được phát hành và phân phối cho người chơi.  Ngày sẽ được công bố trên kênh thông báo của chúng tôi. Hãy chờ đón!`

const HowToEarn_Br = (_arg: { guideLink: string }) =>
  `[Versão completa do guia.](${_arg.guideLink})

💰Toque para ganhar
Toque na tela e colete moedas.

📈 Níveis 
Quanto mais moedas você mantiver em seu saldo, maior será o nível de sua Exchange. Quanto maior o nível, mais rápido você poderá ganhar mais moedas.

🚀 Impulsos
Obtenha e aumente os impulsos para ganhar ainda mais moedas a cada toque na tela.

👥 Amigos
Convide seus amigos e você receberá mais bônus. Ajude um amigo a avançar para as próximas ligas e você receberá ainda mais bônus.

⏰ Lucros por hora.
Incremente os cartões disponiveis para conseguir oportunidades extras de renda passiva. O ganho passivo funcionará de forma automática por 3 horas, mesmo quando você não estiver no jogo. Após esse período você precisará entrar novamente no jogo.

   Listagem de tokens
No final da temporada, um token será lançado e distribuído entre os jogadores. As datas serão divulgadas em nosso canal de anúncios oficiais. Fique atento!

/help para mostrar este guia`

const HowToEarn = {
  ru: HowToEarn_Ru,
  en: HowToEarn_En,
  latam: HowToEarn_Latam,
  uz: HowToEarn_Uz,
  vn: HowToEarn_Vn,
  br: HowToEarn_Br,
}

// ------------------------ //

const Btn_ToPlay = {
  ru: 'Играть в 1 клик 🐹',
  en: 'Play in 1 click 🐹',
  latam: 'Jugar en 1 clic 🐹',
  uz: '1 bosishda o‘ynang 🐹',
  vn: 'Chơi trong 1 cú nhấp chuột 🐹',
  br: 'Jogar em 1 clique 🐹',
}

const Btn_Subscribe = {
  ru: 'Подписаться на официальный канал',
  en: 'Subscribe to HK official channel',
  latam: 'Suscríbete al canal oficial de HK',
  uz: 'HK rasmiy kanaliga obuna bo‘ling',
  vn: 'Đăng ký kênh chính thức của HK',
  br: 'Inscreva-se no canal oficial da HK',
}

const Btn_HowToEarn = {
  ru: 'Как заработать на игре',
  en: 'How to earn from the game',
  latam: 'Cómo ganar del juego',
  uz: 'O‘yindan qanday daromad olish mumkin',
  vn: 'Làm thế nào để kiếm từ trò chơi',
  br: 'Como ganhar com o jogo',
}

const Btn_InviteFriends = {
  ru: 'Пригласить друзей',
  en: 'Invite a friend',
  latam: 'Invitar a un amigo',
  uz: "Do'stlarni taklif qilish",
  vn: 'Mời bạn bè',
  br: 'Convidar um amigo',
}

const Btn_BackToGame = {
  ru: '🎮 Вернуться в Hamster Kombat',
  en: '🎮 Back to Hamster Kombat',
  latam: '🎮 Volver a Hamster Kombat',
  uz: '🎮 Hamster Kombatga qaytish',
  vn: '🎮 Quay lại Hamster Kombat',
  br: '🎮 Voltar para o Hamster Kombat',
}

const Promo_News = {
  ru: `Важное напоминание для тех, кто не успевает следить за новостями Hamster Kombat!

🎁 Разыгрываем Telegram premium x100, обязательно подпишись на канал, если еще не подписан!

👥 Сейчас повышенный бонус за приглашенных друзей, скорее зови их!

🚀 Выпущены новые карточки, не забывай прокачивать!
`,
  en: `Important reminder for those who are unable to keep up with Hamster Kombat news!

🎁 We're giving away Telegram premium x100, make sure to subscribe to the channel if you haven't already!

👥 There's currently a heightened bonus for inviting friends, so call them quickly!

🚀 New cards have been released, don't forget to level up!
`,
  latam: `Recordatorio importante para quienes no pueden estar al tanto de las noticias de Hamster Kombat en este momento.

🎁 ¡Estamos regalando Telegram premium x100, asegúrate de suscribirte al canal si aún no lo has hecho!

👥 ¡Actualmente hay un bono aumentado por invitar amigos, así que llámalos rápido!

🚀 Se han lanzado nuevas cartas, ¡no olvides mejorarlas!
`,
  uz: `Hamster Kombat yang yangiliklarini kuzatishga qodir bo'lmaganlar uchun muhim eslatma!

🎁 Telegram premium x100 o'lchash, agar hali obuna bo'lmagan bo'lsangiz, kanalga obuna bo'ling!

👥 Do'stlarni taklif qilish uchun yuqori bonuslar mavjud, shuning uchun tezda ularni chaqiring!

🚀 Yangi kartochkalar chiqdi, unutmang ularga daraja bering!
`,
  vn: `Nhắc nhở quan trọng cho những người không kịp thời cập nhật tin tức của Hamster Kombat!

🎁 Chúng tôi đang tặng Telegram premium x100, hãy đảm bảo đăng ký kênh nếu bạn chưa là thành viên!

👥 Hiện có một khoản thưởng tăng cao cho việc mời bạn bè, vì vậy hãy gọi họ nhanh chóng!

🚀 Các lá bài mới đã được phát hành, đừng quên nâng cấp!
`,
  br: `Lembrete importante para aqueles que não conseguem acompanhar as notícias do Hamster Kombat!

🎁 Estamos sorteando o Telegram premium x100, certifique-se de se inscrever no canal se ainda não o fez!

👥 Há atualmente um bônus aumentado para convidar amigos, então chame-os rapidamente!

🚀 Novos cartões foram lançados, não se esqueça de evoluí-los!
`,
}

const Btn_PlayNow = {
  ru: 'Играть! 🎮',
  en: 'Play! 🎮',
  latam: 'Jugar ahora! 🎮',
  uz: 'Hozir o‘ynang! 🎮',
  vn: 'Chơi ngay! 🎮',
  br: 'Jogar agora! 🎮',
}

const Btn_Join_Tg = {
  ru: 'Присоединиться к сообществу',
  en: 'Join our TG',
  latam: 'Únete a nuestro TG',
  uz: 'Guruhimizga qo‘shilish',
  vn: 'Tham gia nhóm TG của chúng tôi',
  br: 'Junte-se ao nosso TG',
}

const Btn_Join_X = {
  ru: 'Присоединиться к сообществу',
  en: 'Join our X',
  latam: 'Únete a nuestro X',
  uz: 'Guruhimizga qo‘shilish',
  vn: 'Tham gia X của chúng tôi',
  br: 'Junte-se ao nosso X',
}

const Btn_Play_Hamster_Kombat = {
  ru: 'Играть в Hamster Kombat',
  en: 'Play Hamster Kombat',
  latam: 'Jugar a Hamster Kombat',
  uz: "Hamster Kombat o'ynash",
  vn: 'Chơi Hamster Kombat',
  br: 'Jogar Hamster Kombat',
}

const Promo_Reactivation = {
  ru: `Дорогой друг, я скучал по тебе! У тебя все еще нет ключей

В твоей лиге 14% игроков уже получили ключи. Каждый ключ – это ценный актив. Играй в мини-игру и другие игры семейства Hamster, чтобы получить ключи

Иди и забирай ключи!`,
  en: `Dear friend, I’ve missed you! You still don't have your keys

In your league 14% of players have already received keys. Each key is a valuable asset. Play the minigame and other Hamster Family games to get keys

Go get the keys!`,
  latam: `Querido amigo, ¡te he extrañado! Todavía no tienes tus llaves

En tu liga, el 14% de los jugadores ya han recibido llaves. Cada llave es un activo valioso. Juega al minijuego y otros juegos de la Familia Hamster para conseguir llaves

¡Ve a buscar las llaves!`,
  uz: `Do'stim, seni sog'indim! Hali ham kalitlaring yo'q

Sening ligangda o'yinchilarning 14% kalitlarni allaqachon qo'lga kiritgan. Har bir kalit qimmatli aktiv hisoblanadi. Kalitlarni olish uchun mini-o'yin va boshqa Hamster Family o'yinlarini o'yna

Kalitlarni olishga bor!`,
  vn: `Bạn thân mến, tôi đã nhớ bạn! Bạn vẫn chưa có chìa khóa của mình

Trong giải đấu của bạn, 14% người chơi đã nhận được chìa khóa. Mỗi chìa khóa là một tài sản quý giá. Chơi minigame và các trò chơi khác của Hamster Family để lấy chìa khóa

Hãy đi lấy chìa khóa!`,
  br: `Querido amigo, senti sua falta! Você ainda não tem suas chaves

Na sua liga, 14% dos jogadores já receberam chaves. Cada chave é um ativo valioso. Jogue o minigame e outros jogos da Família Hamster para obter chaves

Vá pegar as chaves!`,
}

const CbtWelcome = {
  ru: (gameName: string) => `🐹Поздравляем! 
Вы были отобраны для участия в закрытом бета-тестировании игры "${gameName}". Это уникальная возможность первыми испытать новые механики, повлиять на развитие проекта и стать частью зарождающегося HamsterVerse. 
Напоминаем, что все механики, связанные с использованием токена HMSTR в игре появятся после завершения закрытого бета теста`,
  en: (gameName: string) => `🐹Congratulations!
You’ve been chosen to join the exclusive closed beta test for "${gameName}"! This is your chance to be among the first to explore new mechanics, shape the game’s future, and become a founding member of the HamsterVerse.
Just a heads-up: features involving the HMSTR token will roll out after the closed beta phase.`,
  latam: (gameName: string) => `🐹¡Felicitaciones!
¡Has sido seleccionado para participar en la exclusiva beta cerrada del juego "${gameName}"! Esta es tu oportunidad de ser de los primeros en probar nuevas mecánicas, influir en el desarrollo del proyecto y convertirte en miembro fundador del HamsterVerse.
Nota: Las funciones relacionadas con el token HMSTR se lanzarán después de la fase beta cerrada.`,
  uz: (gameName: string) => `🐹Tabriklaymiz!
Siz "${gameName}" o‘yinining yopiq beta-testida ishtirok etish uchun tanlandingiz! Bu sizga yangi mexanikalarni birinchilardan bo‘lib sinab ko‘rish, loyihani rivojlantirishga ta'sir ko‘rsatish va HamsterVerse jamiyatining asoschilaridan biri bo‘lish imkoniyatini beradi.
Eslatma: HMSTR tokeniga bog‘liq funksiyalar yopiq beta sinovidan keyin qo‘shiladi.`,
  vn: (gameName: string) => `🐹Chúc mừng!
Bạn đã được chọn tham gia thử nghiệm beta kín cho trò chơi "${gameName}"! Đây là cơ hội để bạn trở thành một trong những người đầu tiên khám phá các cơ chế mới, góp phần định hình tương lai của trò chơi và trở thành thành viên sáng lập của HamsterVerse.
Lưu ý: Các tính năng liên quan đến token HMSTR sẽ được phát hành sau giai đoạn beta kín.`,
  br: (gameName: string) => `🐹Parabéns!
Você foi selecionado para participar do exclusivo teste beta fechado do jogo "${gameName}"! Esta é sua chance de ser um dos primeiros a explorar novas mecânicas, influenciar o desenvolvimento do projeto e se tornar um membro fundador do HamsterVerse.
Aviso: As funcionalidades relacionadas ao token HMSTR serão lançadas após a fase beta fechada.`,
}

const HamsterGamedevPromo = `Dear Player! New rewards are waiting for you in Hamsterverse! 

🔥 The Hamster Gamedev event with 2000 TON in prizes has begun!
🏆 500 of top players will get whitelist invitation for the Hamster Boost prize pool on March 17!

🤘 Everyone is welcome to participate, regardless of account level. Don't miss this opportunity — join now and secure your TOP spot on the leaderboards! 
Even more - additional 100 active players will be selected randomly and receive Boost invitations!

🚀 The event will run for 3 days. Make sure to give it your best shot and claim your well-deserved rewards!`

// ------------------------ //

export default {
  Start,
  StartCbt,
  Referral,
  RefLink,
  HowToEarn,
  Btn_ToPlay,
  Btn_Subscribe,
  Btn_HowToEarn,
  Btn_InviteFriends,
  Btn_BackToGame,
  Promo_News,
  Btn_PlayNow,
  Btn_Join_Tg,
  Btn_Join_X,
  Promo_Reactivation,
  Btn_Play_Hamster_Kombat,
  CbtWelcome,
  HamsterGamedevPromo,
}
