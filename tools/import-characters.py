"""One-time importer: builds src/characters/<id>/ (character.json + webp sprites) from ../sprites.
The extra cast is in import-extras.py, which reuses write().

After this runs, each character.json is the source of truth - edit it directly.
Re-running overwrites characters listed in CAST, so only do that on purpose.
Usage: python3 tools/import-characters.py
"""
import json
import os

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(HERE)
SPRITES = os.path.join(GAME, '..', 'sprites')
OUT = os.path.join(GAME, 'src', 'characters')

# id, name, full name, S, A, U, tell trigger, banner color, face center (x, y as fraction of image),
# 2017 comment, lines: greeting, swap ({n} = card count), keep, call, raise, raise2, drop
CAST = [
    ('reimu', 'Reimu', 'Reimu Hakurei', 3, 2, 2, 'twoPairOrTrips', '#d8323c', (0.480, 0.190),
     "Reimu really isn't a gambler. She just doesn't have the donations for it.",
     ["Let's get this over with.", "{n} card{s}, please.", "I'll keep these.", "Fine, I'll call.", "Raise.", "Raising by two!", "Not worth the donations..."]),
    ('yukari', 'Yukari', 'Yukari Yakumo', 1, 3, 5, 'onePair', '#8a5cc2', (0.482, 0.188),
     "Yukari always seems to have the best cards. Does she have some aces in the gap, or is she just bluffing?",
     ["Shall we play a little game?", "{n} from the gap, please.", "These will do nicely.", "I'll call~", "Let's raise the stakes.", "All of it, darling.", "How boring. I fold."]),
    ('marisa', 'Marisa', 'Marisa Kirisame', 2, 4, 4, 'twoPairOrTrips', '#c9a227', (0.465, 0.250),
     "Marisa is greedy, no exception here. She doesn't need good cards to steal the pot.",
     ["Your coins are as good as mine!", "Gimme {n}!", "Keepin' these, ze.", "Call, ze!", "Raise!", "Let's make it big, ze!", "Tch... I'm out."]),
    ('alice', 'Alice', 'Alice Margatroid', 3, 2, 3, 'twoPairOrTrips', '#4a6fd1', (0.589, 0.182),
     "Alice has showed up for a friendly game of poker. She will be soon to realize there is no such thing.",
     ["A friendly game, right?", "{n} card{s}, please.", "I'll stay.", "I'll call.", "Raise.", "Raise two. Calculated.", "...I fold."]),
    ('sakuya', 'Sakuya', 'Sakuya Izayoi', 5, 3, 1, 'twoPairOrTrips', '#5a6fa8', (0.559, 0.158),
     "Strong discipline shows right through Sakuya's gameplay. If she had no honor, she'd be the most likely to cheat.",
     ["Shall we begin?", "{n}, if you please.", "No change.", "Call.", "Raise.", "Two, precisely.", "I withdraw."]),
    ('remilia', 'Remilia', 'Remilia Scarlet', 4, 5, 3, 'straightOrBetter', '#c2185b', (0.490, 0.216),
     "Remilia is the very relentless type. It's no wonder no one will play cards with her at the mansion.",
     ["Bow before fate.", "Give me {n}.", "Fate is already decided.", "I'll humor you.", "Raise.", "Double it. I insist.", "...Hmph. Next time."]),
    ('youmu', 'Youmu', 'Youmu Konpaku', 4, 1, 2, 'noPair', '#3f9b5a', (0.499, 0.120),
     "Youmu was warned about gambling. She's been sheltered from this kind of thing.",
     ["I-I'm not supposed to gamble...", "{n} card{s}, please.", "I'll keep these!", "C-call...", "Raise!", "W-with all my resolve!", "I'm sorry, Lady Yuyuko..."]),
    ('yuyuko', 'Yuyuko', 'Yuyuko Saigyouji', 5, 4, 4, 'straightOrBetter', '#e889b5', (0.511, 0.188),
     "This person warned Youmu about gambling. She would do well to practice what she preaches.",
     ["Oh my, what fun~", "{n} more, please~", "These look tasty~", "I'll call~", "A little more~", "Let's go all the way~", "Oh well~"]),
    ('wriggle', 'Wriggle', 'Wriggle Nightbug', 2, 2, 5, 'noPair', '#2e7d6b', (0.455, 0.189),
     "I hope Wriggle knows we're playing for money here. I don't think it would make a difference on her gameplay if she did.",
     ["Don't underestimate bugs!", "{n} card{s}!", "I'm keeping these!", "Call!", "Raise!", "Bug swarm raise!", "Aww..."]),
    ('mystia', 'Mystia', 'Mystia Lorelei', 2, 3, 4, 'straightOrBetter', '#b5527e', (0.476, 0.195),
     "She lives on the element of surprise. Expect the unexpected tonight.",
     ["Chin chin~ Let's play!", "{n} card{s}~", "I'll keep singing~", "Call~", "Raise~", "Surprise~!", "Not my night..."]),
    ('keine', 'Keine', 'Keine Kamishirasawa', 5, 4, 2, 'twoPairOrTrips', '#3d5aa8', (0.495, 0.268),
     "She's seen every possible hand there is. Don't think that there's a way to fool her.",
     ["Let's see what you've learned.", "{n} card{s}.", "These will suffice.", "Call.", "Raise.", "Raise by two. Pay attention.", "Hmm. A lesson for next time."]),
    ('reisen', 'Reisen', 'Reisen Udongein Inaba', 3, 4, 3, 'noPair', '#a678d6', (0.510, 0.250),
     "Tewi isn't really helping out here. She just likes to cheer Reisen on.",
     ["Master said to win this...", "{n}, please.", "I'll keep these.", "Call.", "Raise.", "Tewi, stop cheering! Raise two!", "I'm out..."]),
    ('eirin', 'Eirin', 'Eirin Yagokoro', 4, 5, 1, 'twoPairOrTrips', '#2f3f8f', (0.313, 0.116),
     "Surgically & methodically picks apart her opponents. Being a doctor means you play by the book.",
     ["Let's proceed methodically.", "{n} card{s}.", "No exchange necessary.", "Call.", "Raise.", "Raise two, as prescribed.", "Fold. Statistically sound."]),
    ('kaguya', 'Kaguya', 'Kaguya Houraisan', 4, 3, 3, 'straightOrBetter', '#a23a5a', (0.528, 0.179),
     "Kaguya isn't quite giving it her all. It would be rude for the host to win her own tournament, after all.",
     ["Welcome to my tournament.", "{n} card{s}, please.", "I'm content with these.", "Call.", "Raise.", "Let's make it interesting.", "Oh dear, I fold."]),
    ('mokou', 'Mokou', 'Fujiwara no Mokou', 1, 5, 4, 'twoPairOrTrips', '#b84a3a', (0.536, 0.100),
     "Money doesn't matter when you've lived forever. Mokou's just here to have a good time.",
     ["Let's have some fun!", "{n}, and make 'em hot!", "Keeping these.", "Sure, I'll call.", "Raise!", "Burn it all! Raise two!", "Eh, whatever."]),
]
# Seat companions: drawn next to the character, no AI of their own.
COMPANIONS = {'reisen': ('Tewi', (0.453, 0.223))}

# Same rules as ../convert_stats.py (see "AI Stats - Poker Face Up format.txt").
CALL = {1: [0, 4, 5, 7, 7, 8, 9], 2: [0, 3, 5, 7, 7, 8, 9], 3: [0, 3, 4, 7, 7, 8, 9], 4: [0, 3, 4, 6, 7, 7, 9], 5: [0, 2, 3, 6, 7, 7, 8]}
RAISE = {1: [0, 1, 2, 4, 5, 6, 7], 2: [0, 2, 3, 4, 5, 6, 8], 3: [0, 2, 3, 5, 6, 7, 8], 4: [0, 2, 4, 5, 7, 8, 9], 5: [0, 3, 4, 5, 7, 8, 9]}
TELL_REVEALS = {'noPair': 0, 'onePair': 1, 'twoPairOrTrips': 2, 'straightOrBetter': 4, 'never': 0}
EMOTIONS = ['Neutral', 'Win', 'Lose', 'Tell']


def pad(a):
    return a + [9] * (12 - len(a))


def save_sprites(src_dir, dest_dir, prefix=''):
    for e in EMOTIONS:
        Image.open(os.path.join(src_dir, f'{e}.png')).save(os.path.join(dest_dir, f'{prefix}{e.lower()}.webp'), quality=88, method=6)


def write(cid, name, full, s, a, u, tell, color, face, comment, lines, order, face_size=0.15):
    """Writes src/characters/<cid>/: sprites from ../sprites/<name>/ and character.json.
    `lines` is greeting, swap, keep, call, raise, raise2, drop, then optionally allIn and busted."""
    dest = os.path.join(OUT, cid)
    os.makedirs(dest, exist_ok=True)
    save_sprites(os.path.join(SPRITES, name), dest)
    call = pad(CALL[s])
    reading = 3 if s >= 4 else 2 if s == 3 else 1
    data = {
        'id': cid,
        'name': name,
        'fullName': full,
        'order': order,
        'stats': {'strictness': s, 'aggression': a, 'unpredictability': u, 'comment': comment},
        'look': {
            'color': color,
            'face': {'x': face[0], 'y': face[1], 'size': face_size},
            'sprites': {e.lower(): f'{e.lower()}.webp' for e in EMOTIONS},
        },
        'ai': {
            'callMax': call,
            'raiseMax': [min(r, c) for r, c in zip(pad(RAISE[a]), call)],
            'raiseAvg': max(50, min(85, 45 + 5 * a + 2 * u)),
            'bluffType': 1 if u <= 2 else 2 if u == 3 else 3,
            'reading': 3 if cid == 'yukari' else reading,
            'changeType': 1 if u >= 4 else 2 if u == 3 else 3,
            'tell': {'when': tell, 'chance': 60 - 10 * s, 'reveals': TELL_REVEALS[tell]},
            'randomBetting': False,
        },
        'lines': dict(zip(['greeting', 'swap', 'keep', 'call', 'raise', 'raise2', 'drop', 'allIn', 'busted'], lines)),
    }
    if cid in COMPANIONS:
        cname, cface = COMPANIONS[cid]
        save_sprites(os.path.join(SPRITES, cname), dest, prefix=f'{cname.lower()}-')
        data['look']['companion'] = {
            'name': cname,
            'face': {'x': cface[0], 'y': cface[1], 'size': 0.15},
            'sprites': {e.lower(): f'{cname.lower()}-{e.lower()}.webp' for e in EMOTIONS},
        }
    with open(os.path.join(dest, 'character.json'), 'w') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write('\n')
    print('wrote', cid)


if __name__ == '__main__':
    for i, entry in enumerate(CAST):
        write(*entry, order=i + 1)
