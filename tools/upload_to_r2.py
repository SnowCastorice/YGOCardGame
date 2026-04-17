#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
upload_to_r2.py — 批量上传卡图到 Cloudflare R2 对象存储

支持上传两种图库：
  - dist（调用图库）：简化命名，前端实际加载 → R2 ocg/dist/
  - source（原始图库）：多图源完整文件名，备份用 → R2 ocg/source/

用法：
    python tools/upload_to_r2.py                    # 默认上传 dist
    python tools/upload_to_r2.py --target source    # 上传 source
    python tools/upload_to_r2.py --target both      # 上传 dist + source
    python tools/upload_to_r2.py --dry-run          # 预览模式
    python tools/upload_to_r2.py loch locr          # 只上传指定卡包
    python tools/upload_to_r2.py --clean-old        # 清理 R2 根目录下旧的卡图文件

需要配置 local/.env 文件。
需要安装 boto3：pip install boto3
"""

import os
import sys
import glob

# === 路径 ===
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
IMAGES_SRC = os.path.join(PROJECT_ROOT, 'data', 'ocg', 'images_source')
IMAGES_DIST = os.path.join(PROJECT_ROOT, 'data', 'ocg', 'images_dist')
ENV_FILE = os.path.join(PROJECT_ROOT, 'local', '.env')

# 卡图子目录列表
PACK_DIRS = ['loch', 'locr', 'blzd', 'blzds', 'losp_vol1', 'losp_vol2']


def load_env(env_file):
    """从 .env 文件加载环境变量"""
    env = {}
    if not os.path.exists(env_file):
        return env
    with open(env_file, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            if '=' in line:
                key, value = line.split('=', 1)
                env[key.strip()] = value.strip()
    return env


def get_r2_client(env):
    """创建 R2 S3 兼容客户端"""
    try:
        import boto3
    except ImportError:
        print('❌ 需要安装 boto3：pip install boto3')
        sys.exit(1)

    account_id = env.get('R2_ACCOUNT_ID', '')
    access_key = env.get('R2_ACCESS_KEY_ID', '')
    secret_key = env.get('R2_SECRET_ACCESS_KEY', '')

    if not all([account_id, access_key, secret_key]):
        print('❌ local/.env 中缺少 R2 配置')
        sys.exit(1)

    return boto3.client(
        's3',
        endpoint_url=f'https://{account_id}.r2.cloudflarestorage.com',
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        region_name='auto',
    )


def get_existing_objects(client, bucket_name, prefix=''):
    """获取桶中已存在的对象列表（key → size）"""
    existing = {}
    paginator = client.get_paginator('list_objects_v2')
    try:
        for page in paginator.paginate(Bucket=bucket_name, Prefix=prefix):
            for obj in page.get('Contents', []):
                existing[obj['Key']] = obj['Size']
    except Exception:
        pass
    return existing


def upload_directory(client, bucket_name, local_dir, r2_prefix, pack_name, existing_objects, dry_run=False):
    """上传单个卡包目录到 R2"""
    pack_dir = os.path.join(local_dir, pack_name)
    files = sorted(glob.glob(os.path.join(pack_dir, '*.webp')))

    if not files:
        print(f'  {pack_name}/: 无 webp 文件，跳过')
        return 0, 0

    uploaded = 0
    skipped = 0

    for filepath in files:
        filename = os.path.basename(filepath)
        r2_key = f'{r2_prefix}/{pack_name}/{filename}'
        local_size = os.path.getsize(filepath)

        if r2_key in existing_objects and existing_objects[r2_key] == local_size:
            skipped += 1
            continue

        if dry_run:
            uploaded += 1
        else:
            try:
                client.upload_file(
                    filepath, bucket_name, r2_key,
                    ExtraArgs={'ContentType': 'image/webp'}
                )
                uploaded += 1
            except Exception as e:
                print(f'    ❌ 上传失败: {r2_key} — {e}')

    status = ' [预览]' if dry_run else ''
    print(f'  {pack_name}/: {uploaded} 个上传{status}，{skipped} 个跳过（共 {len(files)} 个）')
    return uploaded, skipped


def clean_old_files(client, bucket_name, dry_run=False):
    """清理 R2 根目录下旧的卡图文件（不在 ocg/ 前缀下的）"""
    print('\n🧹 清理旧文件（根目录下的卡图）...')
    existing = get_existing_objects(client, bucket_name)
    old_keys = [k for k in existing if not k.startswith('ocg/')]

    if not old_keys:
        print('  无需清理')
        return

    print(f'  发现 {len(old_keys)} 个旧文件')
    if dry_run:
        for k in old_keys[:10]:
            print(f'    [预览] 将删除: {k}')
        if len(old_keys) > 10:
            print(f'    ... 还有 {len(old_keys) - 10} 个')
    else:
        # R2 支持批量删除（每次最多 1000 个）
        for i in range(0, len(old_keys), 1000):
            batch = old_keys[i:i+1000]
            client.delete_objects(
                Bucket=bucket_name,
                Delete={'Objects': [{'Key': k} for k in batch]}
            )
        print(f'  ✅ 已删除 {len(old_keys)} 个旧文件')


def main():
    args = sys.argv[1:]
    dry_run = '--dry-run' in args
    clean_old = '--clean-old' in args
    target = 'dist'  # 默认只上传 dist

    if dry_run:
        args.remove('--dry-run')
    if clean_old:
        args.remove('--clean-old')
    if '--target' in args:
        idx = args.index('--target')
        target = args[idx + 1]
        args = args[:idx] + args[idx+2:]

    target_packs = args if args else PACK_DIRS

    print('=' * 60)
    print('上传卡图到 Cloudflare R2')
    if dry_run:
        print('⚠️ 预览模式')
    print('=' * 60)

    env = load_env(ENV_FILE)
    bucket_name = env.get('R2_BUCKET_NAME', 'ygo-card-images')
    public_url = env.get('R2_PUBLIC_URL', '')
    client = get_r2_client(env)

    # 清理旧文件
    if clean_old:
        clean_old_files(client, bucket_name, dry_run)

    # 上传计划
    upload_tasks = []
    if target in ('dist', 'both'):
        upload_tasks.append(('ocg/dist', IMAGES_DIST, '调用图库'))
    if target in ('source', 'both'):
        upload_tasks.append(('ocg/source', IMAGES_SRC, '原始图库'))

    total_uploaded = 0
    total_skipped = 0

    for r2_prefix, local_dir, label in upload_tasks:
        print(f'\n📤 上传{label} → {r2_prefix}/')
        existing = get_existing_objects(client, bucket_name, prefix=r2_prefix)
        print(f'  R2 {r2_prefix}/ 已有 {len(existing)} 个文件')

        for pack in target_packs:
            if not os.path.exists(os.path.join(local_dir, pack)):
                print(f'  ⚠️ 本地目录不存在: {local_dir}/{pack}')
                continue
            u, s = upload_directory(client, bucket_name, local_dir, r2_prefix, pack, existing, dry_run)
            total_uploaded += u
            total_skipped += s

    print(f'\n{"=" * 60}')
    print(f'汇总：{total_uploaded} 个上传，{total_skipped} 个跳过')
    if public_url and 'dist' in target or target == 'both':
        print(f'调用图库: {public_url}/ocg/dist/{{pack}}/{{filename}}')
    print('=' * 60)


if __name__ == '__main__':
    main()
