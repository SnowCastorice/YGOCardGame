#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
update_cards_db.py — 百鸽(YGOCDB) 卡牌数据库更新脚本

【功能说明】
从百鸽 API (ygocdb.com) 下载全量卡牌数据库 cards.json，
替换本地 tools/db/cards.json，使项目拥有最新的卡牌信息。

【数据源】
- API 文档：https://ygocdb.com/api
- 全量数据：https://ygocdb.com/api/v0/cards.zip
- MD5 校验：https://ygocdb.com/api/v0/cards.zip.md5

【使用方法】
  python update_cards_db.py                # 检查更新并下载（有更新才下载）
  python update_cards_db.py --force        # 强制重新下载（跳过 MD5 检查）
  python update_cards_db.py --check        # 只检查是否有更新，不下载
  python update_cards_db.py --rebuild      # 下载后自动运行 build_pack_data.py 重建所有卡包
  python update_cards_db.py --info         # 查看本地 cards.json 信息和远程 MD5

【工作流程】
  1. 获取远程 MD5 校验值
  2. 计算本地 cards.json 的 MD5
  3. 如果 MD5 不同（有新数据），下载 cards.zip
  4. 解压得到 cards.json，替换本地文件
  5. （可选）自动运行 build_pack_data.py 重建卡包数据

【注意事项】
  - 下载文件约 3~5MB（压缩后），解压约 12~15MB
  - 请合理使用，不要频繁调用（百鸽服务器是作者自费维护的）
  - 更新后建议运行 build_pack_data.py 重建卡包数据
"""

import hashlib
import io
import json
import os
import subprocess
import sys
import time
import urllib.request
import zipfile


# ====== 配置 ======
YGOCDB_CARDS_ZIP_URL = 'https://ygocdb.com/api/v0/cards.zip'
YGOCDB_CARDS_MD5_URL = 'https://ygocdb.com/api/v0/cards.zip.md5'

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))  # tools/
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)                # 项目根目录
DATA_DIR = os.path.join(PROJECT_ROOT, 'data')
TOOLS_DB_DIR = os.path.join(SCRIPT_DIR, 'db')
CARDS_JSON_PATH = os.path.join(TOOLS_DB_DIR, 'cards.json')

# 本地 MD5 缓存文件（记录上次下载的 MD5，避免重复计算大文件的哈希）
LOCAL_MD5_PATH = os.path.join(TOOLS_DB_DIR, '.cards_md5')

# HTTP 请求超时（秒）
REQUEST_TIMEOUT = 60

# User-Agent（标识项目来源，对百鸽作者友好）
USER_AGENT = 'YGOCardGame/update_cards_db (https://github.com/SnowCastorice/YGOCardGame)'


def get_remote_md5():
    """获取远程 cards.json 的 MD5 校验值"""
    print('🔍 获取远程 MD5 校验值...')
    try:
        req = urllib.request.Request(YGOCDB_CARDS_MD5_URL, headers={'User-Agent': USER_AGENT})
        with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT) as resp:
            md5_text = resp.read().decode('utf-8').strip().strip('"').lower()
            print(f'   远程 MD5: {md5_text}')
            return md5_text
    except Exception as e:
        print(f'❌ 获取远程 MD5 失败: {e}')
        return None


def get_local_md5():
    """获取本地 cards.json 的 MD5 校验值"""
    # 优先使用缓存的 MD5
    if os.path.exists(LOCAL_MD5_PATH):
        with open(LOCAL_MD5_PATH, 'r') as f:
            cached_md5 = f.read().strip().lower()
            if cached_md5:
                print(f'   本地 MD5（缓存）: {cached_md5}')
                return cached_md5

    # 没有缓存则计算
    if not os.path.exists(CARDS_JSON_PATH):
        print('   本地 cards.json 不存在')
        return None

    print('   正在计算本地 cards.json 的 MD5（首次可能需要几秒）...')
    md5 = hashlib.md5()
    with open(CARDS_JSON_PATH, 'rb') as f:
        for chunk in iter(lambda: f.read(8192), b''):
            md5.update(chunk)

    local_md5 = md5.hexdigest()
    print(f'   本地 MD5: {local_md5}')

    # 缓存 MD5
    save_local_md5(local_md5)

    return local_md5


def save_local_md5(md5_value):
    """保存本地 MD5 缓存"""
    os.makedirs(os.path.dirname(LOCAL_MD5_PATH), exist_ok=True)
    with open(LOCAL_MD5_PATH, 'w') as f:
        f.write(md5_value)


def download_and_extract():
    """
    下载 cards.zip 并解压得到 cards.json
    返回: (成功标志, 新的 MD5 值)
    """
    print(f'\n📥 正在下载 cards.zip ...')
    print(f'   URL: {YGOCDB_CARDS_ZIP_URL}')
    start_time = time.time()

    try:
        req = urllib.request.Request(YGOCDB_CARDS_ZIP_URL, headers={'User-Agent': USER_AGENT})
        with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT) as resp:
            zip_data = resp.read()
            elapsed = time.time() - start_time
            size_mb = len(zip_data) / (1024 * 1024)
            print(f'   下载完成: {size_mb:.1f} MB（耗时 {elapsed:.1f}s）')
    except Exception as e:
        print(f'❌ 下载失败: {e}')
        return False, None

    # 解压 ZIP
    print('📦 正在解压...')
    try:
        with zipfile.ZipFile(io.BytesIO(zip_data)) as zf:
            # 查找 cards.json
            names = zf.namelist()
            json_file = None
            for name in names:
                if name.endswith('cards.json'):
                    json_file = name
                    break

            if not json_file:
                print(f'❌ ZIP 中未找到 cards.json，包含文件: {names}')
                return False, None

            # 读取 JSON 数据
            json_data = zf.read(json_file)
            json_size_mb = len(json_data) / (1024 * 1024)
            print(f'   解压完成: {json_file} ({json_size_mb:.1f} MB)')
    except Exception as e:
        print(f'❌ 解压失败: {e}')
        return False, None

    # 计算解压后文件的 MD5（与远程 MD5 对应）
    new_md5 = hashlib.md5(json_data).hexdigest()

    # 验证 JSON 格式
    print('🔍 验证 JSON 格式...')
    try:
        parsed = json.loads(json_data)
        card_count = len(parsed)
        print(f'   ✅ JSON 有效，包含 {card_count} 条卡牌记录')

        # 简单抽样检查数据格式
        sample_key = list(parsed.keys())[0]
        sample = parsed[sample_key]
        required_fields = ['cid', 'id', 'cn_name', 'jp_name', 'text', 'data']
        missing_fields = [f for f in required_fields if f not in sample]
        if missing_fields:
            print(f'   ⚠️ 数据格式可能有变化，缺少字段: {missing_fields}')
        else:
            print(f'   ✅ 数据格式验证通过')
    except json.JSONDecodeError as e:
        print(f'❌ JSON 格式无效: {e}')
        return False, None

    # 备份旧文件
    if os.path.exists(CARDS_JSON_PATH):
        backup_path = CARDS_JSON_PATH + '.bak'
        print(f'📋 备份旧文件: {os.path.basename(backup_path)}')
        try:
            os.replace(CARDS_JSON_PATH, backup_path)
        except Exception as e:
            print(f'   ⚠️ 备份失败（继续写入）: {e}')

    # 写入新文件
    print('💾 写入新的 cards.json ...')
    os.makedirs(os.path.dirname(CARDS_JSON_PATH), exist_ok=True)
    with open(CARDS_JSON_PATH, 'wb') as f:
        f.write(json_data)

    # 更新本地 MD5 缓存
    save_local_md5(new_md5)

    print(f'✅ 更新完成！共 {card_count} 条卡牌记录')
    return True, new_md5


def run_build_pack_data():
    """运行 build_pack_data.py 重建所有卡包数据"""
    build_script = os.path.join(SCRIPT_DIR, 'build_pack_data.py')  # 同目录下的脚本
    if not os.path.exists(build_script):
        print('⚠️ 未找到 build_pack_data.py，跳过重建')
        return

    print(f'\n{"=" * 50}')
    print('🔨 自动运行 build_pack_data.py 重建卡包数据...')
    print(f'{"=" * 50}\n')

    try:
        subprocess.run([sys.executable, build_script], cwd=PROJECT_ROOT, check=True)
    except subprocess.CalledProcessError as e:
        print(f'⚠️ build_pack_data.py 运行异常（退出码 {e.returncode}）')
    except Exception as e:
        print(f'⚠️ 运行 build_pack_data.py 失败: {e}')


def cmd_update(force=False, rebuild=False):
    """检查更新并下载（主命令）"""
    remote_md5 = get_remote_md5()
    if not remote_md5 and not force:
        print('❌ 无法获取远程 MD5，如需强制下载请使用 --force')
        return

    if not force:
        local_md5 = get_local_md5()
        if local_md5 == remote_md5:
            print('\n✅ 本地数据库已是最新版本，无需更新')
            return
        else:
            print(f'\n📢 发现新版本！')
            if local_md5:
                print(f'   本地: {local_md5}')
            print(f'   远程: {remote_md5}')
    else:
        print('\n⚡ 强制下载模式，跳过 MD5 检查')

    # 下载并解压
    success, new_md5 = download_and_extract()

    if success and rebuild:
        run_build_pack_data()

    if success:
        print(f'\n{"=" * 50}')
        print('🎉 卡牌数据库更新完成！')
        if not rebuild:
            print('💡 建议运行以下命令重建卡包数据：')
            print('   python build_pack_data.py')
        print(f'{"=" * 50}')


def cmd_check():
    """只检查是否有更新"""
    remote_md5 = get_remote_md5()
    if not remote_md5:
        return

    local_md5 = get_local_md5()

    print(f'\n{"=" * 40}')
    if local_md5 == remote_md5:
        print('✅ 本地数据库已是最新版本')
    elif not local_md5:
        print('📢 本地无 cards.json，需要下载')
        print('   运行: python update_cards_db.py')
    else:
        print('📢 有新版本可用！')
        print(f'   本地 MD5: {local_md5}')
        print(f'   远程 MD5: {remote_md5}')
        print('   运行: python update_cards_db.py')
    print(f'{"=" * 40}')


def cmd_info():
    """查看本地和远程信息"""
    # 本地信息
    print(f'\n📊 本地 cards.json 信息:')
    if os.path.exists(CARDS_JSON_PATH):
        size = os.path.getsize(CARDS_JSON_PATH)
        mtime = os.path.getmtime(CARDS_JSON_PATH)
        mtime_str = time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(mtime))
        print(f'   文件大小: {size / (1024 * 1024):.1f} MB')
        print(f'   最后修改: {mtime_str}')

        # 统计卡牌数量
        try:
            with open(CARDS_JSON_PATH, 'r', encoding='utf-8') as f:
                data = json.load(f)
            print(f'   卡牌总数: {len(data)} 条')

            # 统计有各语言名称的卡
            cn_count = sum(1 for c in data.values() if c.get('cn_name'))
            jp_count = sum(1 for c in data.values() if c.get('jp_name'))
            en_count = sum(1 for c in data.values() if c.get('en_name'))
            print(f'   有中文名: {cn_count}')
            print(f'   有日文名: {jp_count}')
            print(f'   有英文名: {en_count}')
        except Exception:
            pass
    else:
        print('   ⚠️ 文件不存在')

    # 本地 MD5
    local_md5 = get_local_md5()

    # 远程 MD5
    print()
    remote_md5 = get_remote_md5()

    # 对比
    if local_md5 and remote_md5:
        print(f'\n📋 对比结果:')
        if local_md5 == remote_md5:
            print('   ✅ 本地与远程一致（已是最新）')
        else:
            print('   📢 本地与远程不一致（有更新可用）')


def main():
    print('=' * 50)
    print('  百鸽(YGOCDB) 卡牌数据库更新工具')
    print('  数据源: https://ygocdb.com/api')
    print('=' * 50)

    if len(sys.argv) < 2:
        cmd_update()
        return

    args = sys.argv[1:]
    force = '--force' in args
    rebuild = '--rebuild' in args

    if '--check' in args:
        cmd_check()
    elif '--info' in args:
        cmd_info()
    elif '--help' in args or '-h' in args:
        print(__doc__)
    else:
        cmd_update(force=force, rebuild=rebuild)


if __name__ == '__main__':
    main()
