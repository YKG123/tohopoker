"""One-time importer for the extra cast (Touhou Docs/Extras.txt): builds src/characters/<id>/ like
import-characters.py does, from the sprites picked into ../sprites/<Name>/ (see ../sprites/picks.txt).

Stats are the 2017 doc's stars; where the doc left them blank they were filled in to suit the character
(marked "filled in" below). Comments are the doc's where it had them, otherwise written in its style.
Re-running overwrites these characters, so only do that on purpose: edit character.json directly instead.
Usage: python3 tools/import-extras.py [id ...]
"""
import importlib.util
import json
import os

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('base', os.path.join(HERE, 'import-characters.py'))
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)

# Faces are drawn at about the same pixel size across dairi's art, so the face box is a fixed height in pixels.
FACE_PX = 180

# id, name, full name, S, A, U, tell trigger, banner color, face center, comment,
# lines: greeting, swap ({n} = card count, {s} = plural s), keep, call, raise, raise2, drop, allIn, busted
EXTRAS = [
    ('rumia', 'Rumia', 'Rumia', 1, 3, 4, 'onePair', '#c9a227', (0.47, 0.135),
     "Keep your cards on the table, Rumia. It just looks silly when you hold them in your hands.",
     ["Is that so~?", "{n} card{s}~", "These are fine~", "Call~", "Raise~", "Is that so? Raise two~", "I can't see a thing...",
      "All of it~ Is that so?", "Can I eat the dealer instead?"]),
    ('cirno', 'Cirno', 'Cirno', 1, 5, 3, 'straightOrBetter', '#4aa8e0', (0.45, 0.17),
     "All in, all the time! If you keep hitting life hard, it's bound to hit back.",
     ["I'm the strongest!", "Gimme {n}!", "Mine are already the best!", "Call!", "Raise!", "Raise two! Strongest!", "Hmph! I let you have that one!",
      "All in! Obviously!", "That's not fair! Rematch!"]),
    ('daiyousei', 'Daiyousei', 'Daiyousei', 1, 1, 1, 'noPair', '#5aa64a', (0.4, 0.13),
     "Cirno brought a friend to the tournament. You're in over your head, aren't you?",
     ["Um, hello... Cirno brought me.", "{n}, p-please.", "I'll keep these, I think.", "C-call...", "Raise...?", "Raise two? Is that okay?", "I'll sit this one out.",
      "All in? Oh no, oh no...", "I'll go find Cirno..."]),
    ('meiling', 'Meiling', 'Hong Meiling', 2, 5, 2, 'twoPairOrTrips', '#2e9e5b', (0.41, 0.154),
     "Why do they just keep staring blankly? Won't they just show their cards already? If this tournament goes on much longer, she'll fall asleep.",
     ["Hiya! I'm wide awake, promise.", "{n}, please!", "Holding firm!", "Call!", "Raise!", "Full force! Raise two!", "Zzz... huh? I fold!",
      "All in! Hyaaah!", "Sakuya's going to stab me for this..."]),
    ('patchouli', 'Patchouli', 'Patchouli Knowledge', 4, 3, 1, 'twoPairOrTrips', '#8a4fb5', (0.368, 0.155),
     "Patchouli woke up just in time for tonight's tournament. Day and night don't exist in the magic library.",
     ["Let's keep this quiet.", "{n} card{s}.", "No exchange.", "Call.", "Raise.", "Raise two. The odds favor it.", "Not worth the effort.",
      "All in. I've done the reading.", "I'm going back to the library."]),
    ('flandre', 'Flandre', 'Flandre Scarlet', 1, 5, 5, 'straightOrBetter', '#d42a3c', (0.57, 0.2),
     "Flandre has never been let out to play before. Try not to break her heart, or she'll break everything else.",
     ["Will you play with me?", "Give me {n}!", "I like these ones.", "Call!", "Raise!", "Raise two! Don't break!", "Boring... I'll break it later.",
      "All in! Kyuu~ to the pot!", "Aww, you broke me first..."]),
    ('chen', 'Chen', 'Chen', 1, 3, 5, 'noPair', '#c0392b', (0.37, 0.118),
     "Chen came along because Ran did. Nobody has explained the rules to her yet.",
     ["Ran-sama said I could play!", "{n} card{s}, nya!", "I'll keep 'em!", "Call, nya!", "Raise!", "Raise two! Nyaa!", "Nyaa... I fold.",
      "All in, nya!", "Ran-samaaa!"]),
    ('ran', 'Ran', 'Ran Yakumo', 1, 2, 4, 'onePair', '#e8b62a', (0.495, 0.173),
     "You can sense Yukari's influence on Ran. Her tricks are all borrowed, but they still work.",
     ["Lady Yukari sends her regards.", "{n}, please.", "As calculated.", "Call.", "Raise.", "Raise two, per my calculations.", "A strategic retreat.",
      "All in. Lady Yukari would approve.", "Lady Yukari will not be pleased..."]),
    ('lunasa', 'Lunasa', 'Lunasa Prismriver', 4, 2, 1, 'twoPairOrTrips', '#2f3a4a', (0.5, 0.18),  # stats filled in
     "The eldest Prismriver came without her sisters tonight. Her poker face is as gloomy as her violin.",
     ["...Good evening.", "{n}.", "I'll keep them.", "Call.", "Raise.", "Raise two.", "...How depressing.",
      "All in. A finale.", "The concert is over."]),
    ('minoriko', 'Minoriko', 'Minoriko Aki', 3, 3, 2, 'twoPairOrTrips', '#d9822b', (0.43, 0.159),  # stats filled in
     "Card games are the best way to pass time on the farm. Expect a quality game.",
     ["A bountiful harvest awaits!", "{n} card{s}, please.", "These are ripe.", "Call.", "Raise.", "Raise two! Harvest time!", "Not ripe yet. I fold.",
      "All in! Reap it all!", "A poor harvest this year..."]),
    ('shizuha', 'Shizuha', 'Shizuha Aki', 2, 2, 4, 'noPair', '#c9562c', (0.47, 0.16),  # S and A filled in
     "Shizuha never was as good as her sister at cards. The beauty of card games is that luck sometimes smiles on her.",
     ["Hello... Minoriko said I should come.", "{n}, please.", "I'll keep these.", "Call.", "Raise.", "Raise two... maybe?", "Falling, like the leaves.",
      "All in, before the leaves fall.", "Winter comes for everyone..."]),
    ('hina', 'Hina', 'Hina Kagiyama', 4, 4, 3, 'straightOrBetter', '#b52a4a', (0.43, 0.188),
     "Only a lunatic would play cards with a goddess of misfortune. If she starts spinning, make an excuse to quietly fold.",
     ["Careful. Misfortune is catching.", "{n}, please.", "Keeping my luck.", "Call.", "Raise.", "Raise two. Round and round.", "I'll take my bad luck elsewhere.",
      "All in. Spin, spin, spin!", "Bad luck... for once, it's mine."]),
    ('nitori', 'Nitori', 'Nitori Kawashiro', 5, 5, 2, 'twoPairOrTrips', '#3a7fc2', (0.37, 0.22),
     "Kappa gambling is a tough scene. Nitori has since retired in search of greater profit.",
     ["Let's talk business.", "{n} card{s}. Fair trade.", "These are a good investment.", "Call.", "Raise.", "Raise two! Profit!", "Bad deal. I'm out.",
      "All in! Kappa tech never fails!", "My savings! My cucumbers!"]),
    ('aya', 'Aya', 'Aya Shameimaru', 4, 3, 2, 'onePair', '#b5262c', (0.4, 0.15),
     "Aya is only here for the story. Every big bluff ends up in tomorrow's paper.",
     ["Bunbunmaru News, reporting!", "{n} card{s}, quickly!", "These make a fine headline.", "Call.", "Raise!", "Raise two! Hot scoop!", "No comment. I fold.",
      "All in! Stop the presses!", "This won't make the front page..."]),
    ('sanae', 'Sanae', 'Sanae Kochiya', 2, 2, 3, 'twoPairOrTrips', '#2f9e5b', (0.526, 0.123),
     "Kanako tells her one thing, and Suwako tells her another. In the end, nothing comes of it but an overburdened shrine maiden.",
     ["Moriya Shrine is open for business!", "{n} card{s}, please!", "A miracle hand!", "Call!", "Raise!", "Raise two! Miracles happen!", "Lord Kanako said to fold...",
      "All in! It's a miracle!", "Lady Suwako said this would happen..."]),
    ('suwako', 'Suwako', 'Suwako Moriya', 5, 2, 3, 'onePair', '#c9a64a', (0.42, 0.24),
     "After losing her shrine, Suwako won't let anything else slip away. Who said we were friends?",
     ["Ribbit. Who said we were friends?", "{n} card{s}, ribbit.", "These stay with me.", "Call.", "Raise.", "Raise two. Ribbit.", "Fine. Keep your pot.",
      "All in. I'm not losing twice.", "Not again... not to you."]),
    ('kanako', 'Kanako', 'Kanako Yasaka', 3, 5, 1, 'twoPairOrTrips', '#6a3a9e', (0.49, 0.215),
     "Kanako tried to get Kaguya to put Eientei up as a bet. Oh, brood of vipers!",
     ["Faith is the best currency.", "{n} card{s}.", "I have faith in these.", "Call.", "Raise.", "Raise two! Have faith!", "A temporary setback.",
      "All in! Onbashira!", "My faith... wasted..."]),
    ('yamame', 'Yamame', 'Yamame Kurodani', 2, 3, 2, 'twoPairOrTrips', '#8a5a2a', (0.46, 0.178),
     "I wouldn't compete with Yamame for the pot. It's a bad idea to handle the chips she's touched.",
     ["Hey there! Don't mind the cough.", "{n}, please!", "I'll hang onto these.", "Call!", "Raise!", "Raise two! Caught in my web!", "Ah, slipped through the web.",
      "All in! It's catching!", "Back to the pit for me..."]),
    ('parsee', 'Parsee', 'Parsee Mizuhashi', 3, 4, 1, 'onePair', '#3a9e5a', (0.451, 0.149),
     "Parsee is jealous of every pot she doesn't win. Which is most of them.",
     ["So jealous of your stack.", "{n}. Jealous?", "Mine. Not yours.", "Call.", "Raise.", "Raise two. Jealous yet?", "Envious... so envious...",
      "All in. Envy everything!", "I'm jealous of everyone still playing."]),
    ('yuugi', 'Yuugi', 'Yuugi Hoshiguma', 1, 4, 5, 'straightOrBetter', '#d4562c', (0.422, 0.128),
     "Yuugi's strategy is as harmful to herself as it is to others. Don't feel bad, she's the one who came here drunk.",
     ["Let's drink and play!", "Gimme {n}!", "Keeping 'em. Hic.", "Call!", "Raise!", "Raise two! Hah!", "Ah, pass me the sake.",
      "All in! Hahaha!", "Hah! Good game. Drinks on you!"]),
    ('satori', 'Satori', 'Satori Komeiji', 3, 2, 1, 'twoPairOrTrips', '#d07aa8', (0.447, 0.148),
     "Get your third eye off my cards, Satori. You'll play fair like the rest of us.",
     ["I already know what you're holding.", "{n}, please.", "No need to change.", "Call.", "Raise.", "Raise two. You were thinking of folding.", "I read that wrong. How rare.",
      "All in. I know you'll fold.", "...You were thinking of nothing at all."]),
    ('rin', 'Rin', 'Rin Kaenbyou', 4, 2, 5, 'noPair', '#c22a2a', (0.4, 0.17),
     "Rin brought her wheelbarrow to the tournament. Corpses, chips, what's the difference?",
     ["Got any corpses? Chips'll do.", "{n}, nya!", "These are keepers.", "Call~", "Raise!", "Raise two! Into the barrow!", "I'll wheel on outta here.",
      "All in! Load up the wheelbarrow!", "Somebody wheel me home..."]),
    ('utsuho', 'Utsuho', 'Utsuho Reiuji', 2, 5, 4, 'straightOrBetter', '#2a2a2a', (0.482, 0.148),
     "Utsuho barely found her way to the table. Now she's going nuclear on every hand.",
     ["Unyu? Is this the card game?", "Uh... {n}?", "Keeping these! Probably!", "Call!", "Raise!", "Raise two! Nuclear!", "Unyu... I forgot what I had.",
      "All in! Mega Flare!", "Unyu... Lady Satori's gonna be mad."]),
    ('koishi', 'Koishi', 'Koishi Komeiji', 1, 2, 5, 'never', '#7ab55a', (0.43, 0.148),
     "If you can get into your opponent's head, you've already won. Poor Koishi can't even get into her own head.",
     ["Oh! When did I sit down?", "{n}... I think?", "I'll keep whatever these are.", "Call~", "Raise~", "Raise two~", "Hm? Oh, I folded.",
      "All in~ I didn't mean to.", "Wait, was I playing?"]),
    ('nazrin', 'Nazrin', 'Nazrin', 4, 3, 2, 'onePair', '#7a6a8a', (0.389, 0.14),  # stats filled in
     "Nazrin can sniff out treasure anywhere. An unguarded pot is just another find.",
     ["I smell treasure.", "{n}, please.", "These have value.", "Call.", "Raise.", "Raise two. I've found the treasure.", "Nothing worth digging for.",
      "All in. The treasure's here.", "My dowsing rods lied..."]),
    ('kogasa', 'Kogasa', 'Kogasa Tatara', 4, 1, 4, 'noPair', '#5a8ad0', (0.41, 0.25),
     "Kogasa is making an effort to act inconspicuous. You can't surprise people if you have a reputation for it.",
     ["Surprise! ...No?", "{n} card{s}, please!", "Keeping these. Totally normal.", "Call.", "Raise!", "Raise two! Surprised?", "Nobody was surprised...",
      "Surprise! All in!", "Nobody even jumped..."]),
    ('ichirin', 'Ichirin', 'Ichirin Kumoi', 2, 2, 2, 'twoPairOrTrips', '#3a6ac2', (0.467, 0.11),
     "Unzan was too camera shy to sit in. Ichirin plays a calm, steady game in his place.",
     ["Unzan says good luck.", "{n}, please.", "Steady as the clouds.", "Call.", "Raise.", "Raise two. Unzan agrees.", "Unzan says fold.",
      "All in! Unzan, now!", "Unzan, let's go home."]),
    ('murasa', 'Murasa', 'Minamitsu Murasa', 3, 4, 2, 'twoPairOrTrips', '#2a5a9e', (0.468, 0.165),
     "Murasa doesn't care how big your stack is. It only takes a well-placed crack in the hull for it all to capsize.",
     ["All aboard!", "{n} card{s}, mate!", "Steady as she goes.", "Call.", "Raise!", "Raise two! Full sail!", "Abandon ship!",
      "All in! Sink or swim!", "Sunk, again..."]),
    ('shou', 'Shou', 'Shou Toramaru', 4, 2, 1, 'twoPairOrTrips', '#e0a02a', (0.47, 0.135),
     "Shou isn't really helping out here. She's just cheering Pagoda on.",
     ["The Pagoda will guide us!", "{n}, please.", "The Pagoda approves.", "Call.", "Raise.", "Raise two! Go, Pagoda!", "Where did I put the Pagoda...",
      "All in! The Pagoda believes!", "Nazrin, I lost it all again..."]),
    ('byakuren', 'Byakuren', 'Byakuren Hijiri', 5, 1, 1, 'straightOrBetter', '#8a5ac2', (0.53, 0.164),
     "Nonviolence has done a number on Byakuren. You can't win unless somebody else loses!",
     ["May we all play in peace.", "{n}, please.", "I'm at peace with these.", "Call.", "Raise. Forgive me.", "Raise two. Namusan!", "Let us not quarrel.",
      "All in. Namusan!", "Everyone is equal... in losing."]),
    ('nue', 'Nue', 'Nue Houjuu', 3, 5, 5, 'noPair', '#2a2a3a', (0.446, 0.139),
     "Nobody can tell what Nue is holding. Nobody can tell what Nue is, either.",
     ["Guess what I am.", "{n}. Or is it?", "You can't tell what these are.", "Call.", "Raise!", "Raise two! Unidentified!", "Didn't see that coming...",
      "All in! Guess what I've got!", "Seen through... how?"]),
    ('kyouko', 'Kyouko', 'Kyouko Kasodani', 3, 3, 1, 'twoPairOrTrips', '#5aa88a', (0.544, 0.17),
     "Kyouko doesn't know how she got here, or why she decided to play. Don't let life throw you around!",
     ["GOOD EVENING!", "{n}! {n}! {n}!", "KEEPING THESE!", "CALL! Call... call...", "RAISE!", "RAISE TWO! two... two...", "Fold... old... old...",
      "ALL IN! in... in...", "Bye... bye... bye..."]),
    ('yoshika', 'Yoshika', 'Yoshika Miyako', 2, 1, 1, 'noPair', '#5a3a8a', (0.702, 0.14),
     "Slowly shambles her way through each hand. Without Seiga to bail her out, she's an easy target.",
     ["Uuu... cards...", "{n}... uuu...", "Keep... these...", "Call...", "Raise... uuu...", "Raise... two... uuu!", "Uuu... fold...",
      "All... in... uuu!", "Seiga... help..."]),
    ('seiga', 'Seiga', 'Seiga Kaku', 1, 1, 5, 'onePair', '#3a8ac2', (0.37, 0.14),
     "Eh, what's that? It's my turn again? Even when money is on the line, Seiga just can't bring herself to focus.",
     ["Oh my, a little game?", "Hm? Oh, {n}.", "These are fine, I suppose.", "Call~", "Raise~", "Raise two? Why not~", "Oh, was it my turn? Fold~",
      "All in~ How fun!", "Yoshika, carry me home~"]),
    ('futo', 'Futo', 'Mononobe no Futo', 1, 3, 3, 'straightOrBetter', '#7a8aa8', (0.53, 0.17),
     "Miko left Futo in charge of the shrine's savings. That may have been a mistake.",
     ["Prepare to lose, commoners!", "{n} card{s}, I say!", "These shall do!", "Call!", "Raise!", "Raise two! Behold!", "A tactical retreat!",
      "All in! For the Crown Prince!", "The Crown Prince's savings..."]),
    ('miko', 'Miko', 'Toyosatomimi no Miko', 5, 1, 3, 'twoPairOrTrips', '#8a3ac2', (0.547, 0.198),
     "Miko has waited a thousand years to walk the earth again. She has decided to spend her time... playing card games.",
     ["I hear your desires clearly.", "{n}, please.", "I'm content.", "Call.", "Raise.", "Raise two. I heard your hesitation.", "Patience is a virtue.",
      "All in. I hear victory.", "A thousand years, and this..."]),
    ('mamizou', 'Mamizou', 'Mamizou Futatsuiwa', 2, 3, 5, 'onePair', '#7a5a3a', (0.398, 0.13),
     "Mamizou has a trick for every occasion. Don't trust any card she hands you.",
     ["Shall we have a friendly game?", "{n}, if you please.", "These leaves... I mean cards.", "Call.", "Raise.", "Raise two. Bake-danuki style!", "Well, well. I'll pass.",
      "All in! Don't check the leaves.", "Fooled me good, you did."]),
    ('wakasagihime', 'Wakasagihime', 'Wakasagihime', 5, 2, 5, 'noPair', '#3a6a9e', (0.349, 0.099),
     "A princess of the lake has money to spare. She just won't sit at a table with a kappa.",
     ["Pleased to meet you all!", "{n}, please!", "I'll keep these.", "Call.", "Raise.", "Raise two! Splash!", "Back to the lake...",
      "All in! Splash!", "Back to the lake, I suppose..."]),
    ('sekibanki', 'Sekibanki', 'Sekibanki', 3, 3, 5, 'noPair', '#c22a3a', (0.4, 0.155),
     "Do they think I'm a human? Do they know I'm a youkai? Take it easy, Sekibanki. Poker is stressful enough.",
     ["...I'm human. Totally human.", "{n}.", "Keeping them.", "Call.", "Raise.", "Raise two. Heads up.", "I'm losing my head...",
      "All in! Heads will roll!", "Lost my head... literally."]),
    ('kagerou', 'Kagerou', 'Kagerou Imaizumi', 2, 3, 3, 'straightOrBetter', '#7a2a3a', (0.47, 0.13),  # stats filled in
     "Kagerou is shy until she gets a good hand. The right cards have the same effect as a full moon.",
     ["Um, hi... is the moon out?", "{n}, please.", "I'll keep these.", "Call.", "Raise.", "Raise two! Awooo!", "Too shy for this...",
      "All in! It's a full moon!", "Back to the bamboo..."]),
    ('benben', 'Benben', 'Benben Tsukumo', 3, 3, 2, 'twoPairOrTrips', '#8a6ac2', (0.457, 0.148),  # stats filled in
     "Benben goes wherever the music takes her. Tonight it took her to the poker table.",
     ["Let's make some music.", "{n}, in rhythm.", "These are in tune.", "Call.", "Raise.", "Raise two! Crescendo!", "Off-key. I fold.",
      "All in! Fortissimo!", "The song's over..."]),
    ('yatsuhashi', 'Yatsuhashi', 'Yatsuhashi Tsukumo', 3, 1, 3, 'onePair', '#a87a5a', (0.651, 0.17),
     "Yatsuhashi tagged along with her sister. Don't forget she's still in the hand.",
     ["Remember me? I'm Yatsuhashi!", "{n}, please!", "I'll keep these!", "Call!", "Raise!", "Raise two! Don't forget me!", "You forgot me again...",
      "All in! Remember this!", "Benben, they forgot me..."]),
    ('seija', 'Seija', 'Seija Kijin', 3, 4, 5, 'noPair', '#c23a4a', (0.394, 0.15),  # A and U filled in
     "Seija always does the opposite of what you'd expect. It's too bad that's the norm in poker.",
     ["I'm definitely not cheating.", "{n}. Or not.", "These are terrible. Keeping them.", "Call. Or did I fold?", "Raise!", "Raise two! Upside down!", "I fold. Which means I won.",
      "All in! Turn it upside down!", "Losing is winning! ...Right?"]),
    ('sukuna', 'Sukuna', 'Shinmyoumaru Sukuna', 1, 4, 4, 'straightOrBetter', '#c23a5a', (0.47, 0.19),
     "Sukuna gets overexcited playing this game. Her main objective is to fill her bowl.",
     ["Little but mighty!", "{n}, please!", "These are big enough!", "Call!", "Raise!", "Raise two! Make it bigger!", "My bowl's empty...",
      "All in! Fill my bowl!", "Too small to win..."]),
    ('raiko', 'Raiko', 'Raiko Horikawa', 2, 4, 4, 'twoPairOrTrips', '#c22a2a', (0.54, 0.148),  # stats filled in
     "Raiko keeps the table's rhythm. Fall out of step and she'll drum you out.",
     ["Let's keep the beat!", "{n}, on the beat!", "Holding the rhythm.", "Call.", "Raise!", "Raise two! Drum roll!", "Lost the beat. I fold.",
      "All in! Thunder drums!", "The drums go quiet..."]),
    ('seiran', 'Seiran', 'Seiran', 1, 1, 2, 'noPair', '#3a5ac2', (0.53, 0.25),
     "Seiran is on leave from the Lunar Capital. She's only here to relax.",
     ["Day off! Let's play!", "{n}, please!", "I'll keep these.", "Call~", "Raise!", "Raise two! Pew pew!", "Too much work. I fold.",
      "All in! Fire!", "Back to pounding mochi..."]),
    ('ringo', 'Ringo', 'Ringo', 1, 1, 3, 'onePair', '#e0a02a', (0.58, 0.2),
     "Ringo is here to relax, extra hard. Don't mind the dango.",
     ["Want a dango?", "{n}, please. Munch.", "Keeping these. Munch.", "Call. Munch.", "Raise.", "Raise two! Dango power!", "Eh, I'll just eat.",
      "All in! And another dango!", "At least there's dango."]),
    ('doremy', 'Doremy', 'Doremy Sweet', 2, 3, 3, 'twoPairOrTrips', '#3a4aa8', (0.52, 0.18),
     "There is no winning against Doremy. Even if you don't lose to her, you'll dream about it for weeks.",
     ["Sweet dreams, everyone.", "{n}. Dreamy.", "These are a good dream.", "Call.", "Raise.", "Raise two. A nightmare for you.", "Just a bad dream.",
      "All in. Don't wake up.", "Time to wake up, I suppose."]),
    ('sagume', 'Sagume', 'Sagume Kishin', 4, 4, 2, 'never', '#a8a8b8', (0.52, 0.17),
     "Sagume never says a word at the table. Good luck reading her.",
     ["(nods)", "(holds up {n} finger{s})", "(shakes head)", "(slides chips forward)", "(raises a finger)", "(raises two fingers)", "(turns cards face down)",
      "(pushes everything in)", "(sighs quietly)"]),
    ('clownpiece', 'Clownpiece', 'Clownpiece', 2, 1, 5, 'straightOrBetter', '#c23a8a', (0.5, 0.25),
     "Clownpiece is a fairy from hell. Expect the unexpected, then expect worse.",
     ["It's lunatic time!", "{n}! Lunatic!", "Keeping these! Ha!", "Call!", "Raise!", "Raise two! It's lunatic time!", "Boo, boring!",
      "All in! Lunatic time!", "Back to hell, I guess!"]),
    ('junko', 'Junko', 'Junko', 5, 5, 1, 'twoPairOrTrips', '#d07a2a', (0.49, 0.3),
     "Junko plays simply to kill off her opponents. Let her win a hand or two, or she'll actually kill you.",
     ["I am here for one purpose.", "{n}.", "These are pure.", "Call.", "Raise.", "Raise two. Purely.", "...This changes nothing.",
      "All in. Purified.", "My grudge is not finished."]),
    ('hecatia', 'Hecatia', 'Hecatia Lapislazuli', 4, 1, 3, 'onePair', '#c23a3a', (0.45, 0.21),
     "Hecatia has three bodies and only one seat. She'd rather be playing at all three tables.",
     ["Hiya~ Room for three?", "{n}, please~", "Keeping these~", "Call~", "Raise~", "Raise two~ Times three~", "Eh, I've got two more bodies~",
      "All in~ All three of me~", "Back to hell~ See ya~"]),
]

# Cirno plays the SWF's "shin" AI instead of the formula: random coin-flip betting. Chen doesn't know poker
# either: the same coin flips, but she raises a little less and swaps away whatever she doesn't understand.
AI_OVERRIDES = {
    'cirno': {'callMax': [0, 3, 5, 6, 7, 7, 8, 9, 9, 9, 9, 9], 'raiseMax': [0, 3, 4, 5, 5, 6, 7, 7, 7, 7, 7, 7],
              'raiseAvg': 70, 'changeType': 3, 'bluffType': 2, 'reading': 1, 'randomBetting': True},
    'chen': {'callMax': [0, 3, 5, 6, 7, 7, 8, 9, 9, 9, 9, 9], 'raiseMax': [0, 2, 3, 4, 5, 5, 6, 7, 7, 7, 7, 7],
             'raiseAvg': 60, 'changeType': 1, 'bluffType': 2, 'reading': 1, 'randomBetting': True},
}

if __name__ == '__main__':
    import sys
    only = set(sys.argv[1:])  # optional ids, to re-import just those
    first = len(base.CAST) + 1
    for i, (cid, name, *rest) in enumerate(EXTRAS):
        if only and cid not in only:
            continue
        h = Image.open(os.path.join(base.SPRITES, name, 'Neutral.png')).size[1]
        base.write(cid, name, *rest, order=first + i, face_size=round(FACE_PX / h, 3))
        if cid in AI_OVERRIDES:
            path = os.path.join(base.OUT, cid, 'character.json')
            with open(path) as f:
                data = json.load(f)
            data['ai'].update(AI_OVERRIDES[cid])
            with open(path, 'w') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
                f.write('\n')
