#!/usr/bin/env python3
import re
from pathlib import Path

root = Path('.')
html_files = list(root.rglob('*.html'))
style_map = {}
style_order = []
modified_files = []
skipped_entries = []

# Patterns
tag_pattern = re.compile(r'<(?P<tag>[a-zA-Z0-9_-]+)(?P<attrs>[^>]*?)(?P<selfclose>/?)>', re.S)
style_attr_re = re.compile(r'style\s*=\s*(?P<quote>["\'])(?P<style>.*?)\1', re.S)
class_attr_re = re.compile(r'class\s*=\s*(?P<quote>["\'])(?P<class>.*?)\1', re.S)

for html_file in html_files:
    text = html_file.read_text(encoding='utf-8')
    changed = False

    def repl(m):
        nonlocal changed
        tag = m.group('tag')
        attrs = m.group('attrs')
        selfclose = m.group('selfclose') or ''
        m_style = style_attr_re.search(attrs)
        if not m_style:
            return m.group(0)
        style_str = m_style.group('style').strip()
        # Skip dynamic JS template styles or concatenations
        if '${' in style_str or '`' in style_str or "'+" in style_str or '+"' in style_str:
            skipped_entries.append((str(html_file), style_str))
            return m.group(0)
        if style_str == '':
            # remove empty style attribute
            new_attrs = re.sub(style_attr_re, '', attrs)
            # ensure spacing
            return f'<{tag}{new_attrs}{selfclose}>'
        # register class
        if style_str not in style_map:
            cls = f'cm-inline-{len(style_map)+1}'
            style_map[style_str] = cls
            style_order.append(style_str)
        else:
            cls = style_map[style_str]
        # remove style attr
        new_attrs = re.sub(style_attr_re, '', attrs)
        # handle existing class
        m_class = class_attr_re.search(new_attrs)
        if m_class:
            existing = m_class.group('class')
            q = m_class.group('quote')
            new_class = f'{existing} {cls}'
            new_attrs = re.sub(class_attr_re, f'class={q}{new_class}{q}', new_attrs)
        else:
            q = m_style.group('quote') or '"'
            if new_attrs.strip() == '':
                new_attrs = ' ' + f'class={q}{cls}{q}'
            else:
                new_attrs = new_attrs + ' ' + f'class={q}{cls}{q}'
        changed = True
        # normalize spacing
        return f'<{tag}{new_attrs}{selfclose}>'

    new_text = tag_pattern.sub(repl, text)
    if changed and new_text != text:
        html_file.write_text(new_text, encoding='utf-8')
        modified_files.append(str(html_file))

# Append CSS rules
if style_map:
    style_file = root / 'style.css'
    header = '\n/* === Inline styles extracted programmatically === */\n'
    css_lines = [header]
    for style_str in style_order:
        cls = style_map[style_str]
        s = style_str.strip()
        if not s.endswith(';'):
            s = s + ';'
        css_lines.append(f'.{cls} {{{s}}}\n')
    # ensure style.css exists
    if not style_file.exists():
        style_file.write_text('/* style.css generated */\n', encoding='utf-8')
    content = style_file.read_text(encoding='utf-8')
    if header.strip() in content:
        # append new rules after existing content
        content = content + ''.join(css_lines)
    else:
        content = content + ''.join(css_lines)
    style_file.write_text(content, encoding='utf-8')

# Summary
print('Modified files:', modified_files)
print('Classes extracted:', [style_map[s] for s in style_order])
print('Extracted rules count:', len(style_order))
if skipped_entries:
    print('Skipped dynamic styles count:', len(skipped_entries))
    for f, s in skipped_entries[:20]:
        print(f, ':', s)
