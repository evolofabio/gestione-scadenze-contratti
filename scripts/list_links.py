import re
s=open('contract_manager_dashboard.html',encoding='utf-8').read()
urls=re.findall(r'(?:src|href)=["\']([^"\']+)["\']', s)
print('Found', len(urls), 'total,', len(set(urls)), 'unique')
for u in sorted(set(urls)):
    print(u)
