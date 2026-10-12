"""Restores Flash drawing-layer order in JPEXS SVG exports.

A Flash shape can contain several layers (StyleChangeRecords with new styles). Each layer draws its fills,
then its lines, and later layers paint over earlier ones, so an arm covers the outline of the head behind it.
JPEXS's SVG export writes every layer's fills first and every layer's lines last, so outlines show through
everything. This regroups each shape's paths per layer.

Usage: python3 tools/fix-svg-layers.py <swf.xml from `ffdec -swf2xml`> <dir of exported .svg files>
"""
import os
import re
import sys
import xml.etree.ElementTree as ET


def layer_plan(swf_xml):
    """shapeId -> list of (fill path count, line path count), one entry per layer."""
    plans = {}
    for item in ET.parse(swf_xml).getroot().iter('item'):
        if not (item.get('type') or '').startswith('DefineShape'):
            continue
        records = item.find('shapes/shapeRecords')
        if records is None:
            continue
        layers = [[set(), set()]]
        for r in records:
            if r.get('type') != 'StyleChangeRecord':
                continue
            if r.get('stateNewStyles') == 'true':
                layers.append([set(), set()])
            for flag, key, slot in (('stateFillStyle0', 'fillStyle0', 0), ('stateFillStyle1', 'fillStyle1', 0),
                                    ('stateLineStyle', 'lineStyle', 1)):
                if r.get(flag) == 'true' and r.get(key) not in (None, '0'):
                    layers[-1][slot].add(r.get(key))
        plans[item.get('shapeId')] = [(len(f), len(l)) for f, l in layers if f or l]
    return plans


PATH = re.compile(r'<path [^>]*/>')


class Mismatch(Exception):
    pass


def fix_group(body, plan):
    paths = PATH.findall(body)
    fills = [p for p in paths if 'stroke="none"' in p]
    lines = [p for p in paths if 'stroke="none"' not in p]
    if len(plan) < 2:
        return None
    if sum(f for f, _ in plan) != len(fills) or sum(l for _, l in plan) != len(lines):
        raise Mismatch  # counts don't line up: leave as exported
    ordered, fi, li = [], 0, 0
    for f, l in plan:
        ordered += fills[fi:fi + f] + lines[li:li + l]
        fi += f
        li += l
    if ordered == paths:
        return None
    it = iter(ordered)
    return PATH.sub(lambda _: next(it), body)


def main():
    plans = layer_plan(sys.argv[1])
    fixed = skipped = 0
    for name in sorted(os.listdir(sys.argv[2])):
        if not name.endswith('.svg'):
            continue
        path = os.path.join(sys.argv[2], name)
        svg = open(path, encoding='utf8').read()
        # Map each <g id="shapeN"> def to the SWF shape that a <use> instantiates it from.
        ids = dict(re.findall(r'ffdec:characterId="(\d+)"[^>]*xlink:href="#(shape\d+)"', svg))
        ids = {v: k for k, v in ids.items()}
        changed = False

        def repl(m):
            nonlocal changed, skipped
            plan = plans.get(ids.get(m.group(1), ''))
            if not plan:
                return m.group(0)
            try:
                body = fix_group(m.group(2), plan)
            except Mismatch:
                skipped += 1
                return m.group(0)
            if body is None:
                return m.group(0)
            changed = True
            return f'<g id="{m.group(1)}">{body}</g>'

        svg = re.sub(r'<g id="(shape\d+)">(.*?)</g>', repl, svg, flags=re.S)
        if changed:
            fixed += 1
            open(path, 'w', encoding='utf8').write(svg)
    print(f'layer order restored in {fixed} SVGs; {skipped} shapes left as exported (path counts did not match)')


main()
