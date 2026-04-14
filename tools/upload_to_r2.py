#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
upload_to_r2.py — 批量上传卡图到 Cloudflare R2 对象存储

从 data/ocg/images/ 下的各卡包目录读取 .webp 文件，上传到 R2 存储桶。
已存在的文件自动跳过（通过比较文件大小判断）。

用法：
    python tools/upload_to_r2.py              # 上传所有卡图
    python tools/upload_to_r2.py --dry-run    # 预览模式，不实际上传
    python tools/upload_to_r2.py loch locr    # 只上传指定卡包

需要配置 local/.env 文件（参见 README）。
需要安装 boto3：pip install boto3
"""

import os
import sys
import glob

# === 路径 ===
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
IMAGES_DIR = os.path.join(PROJECT_ROOT, 'data', 'ocg', 'images')
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
        print('❌ local/.env 中缺少 R2 配置（R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY）')
        sys.exit(1)

    endpoint_url = f'https://{account_id}.r2.cloudflarestorage.com'

    return boto3.client(
        's3',
        endpoint_url=endpoint_url,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        region_name='auto',
    )


def get_existing_objects(client, bucket_name, prefix=''):
    """获取桶中已存在的对象列表（key → size）"""
    existing = {}
    paginator = client.get_paginator('list_objects_v2')
    for page in paginator.paginate(Bucket=bucket_name, Prefix=prefix):
        for obj in page.get('Contents', []):
            existing[obj['Key']] = obj['Size']
    return existing


def upload_pack(client, bucket_name, pack_dir, existing_objects, dry_run=False):
    """上传单个卡包目录的所有 .webp 文件"""
    pack_name = os.path.basename(pack_dir)
    files = sorted(glob.glob(os.path.join(pack_dir, '*.webp')))

    if not files:
        print(f'  {pack_name}/: 无 .webp 文件，跳过')
        return 0, 0

    uploaded = 0
    skipped = 0

    for filepath in files:
        filename = os.path.basename(filepath)
        r2_key = f'{pack_name}/{filename}'
        local_size = os.path.getsize(filepath)

        # 已存在且大小一致则跳过
        if r2_key in existing_objects and existing_objects[r2_key] == local_size:
            skipped += 1
            continue

        if dry_run:
            print(f'    [预览] 将上传: {r2_key} ({local_size:,} bytes)')
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

    status = '[预览]' if dry_run else ''
    print(f'  {pack_name}/: {uploaded} 个上传{status}，{skipped} 个已存在跳过（共 {len(files)} 个文件）')
    return uploaded, skipped


def main():
    args = sys.argv[1:]
    dry_run = '--dry-run' in args
    if dry_run:
        args.remove('--dry-run')

    # 指定卡包或全部
    target_packs = args if args else PACK_DIRS

    print('=' * 60)
    print('上传卡图到 Cloudflare R2')
    if dry_run:
        print('⚠️ 预览模式（不实际上传）')
    print('=' * 60)

    # 加载配置
    env = load_env(ENV_FILE)
    bucket_name = env.get('R2_BUCKET_NAME', 'ygo-card-images')
    public_url = env.get('R2_PUBLIC_URL', '')

    # 创建客户端
    client = get_r2_client(env)

    # 获取已存在的对象
    print('\n📋 获取 R2 中已有文件列表...')
    existing = get_existing_objects(client, bucket_name)
    print(f'  R2 中已有 {len(existing)} 个文件')

    # 逐包上传
    total_uploaded = 0
    total_skipped = 0

    print('\n📤 开始上传...')
    for pack in target_packs:
        pack_dir = os.path.join(IMAGES_DIR, pack)
        if not os.path.exists(pack_dir):
            print(f'  ⚠️ 目录不存在: {pack_dir}')
            continue
        u, s = upload_pack(client, bucket_name, pack_dir, existing, dry_run)
        total_uploaded += u
        total_skipped += s

    # 汇总
    print(f'\n{"=" * 60}')
    print(f'汇总：{total_uploaded} 个上传，{total_skipped} 个已存在跳过')
    if public_url:
        print(f'公开访问: {public_url}/{{pack}}/{{filename}}')
    print('=' * 60)


if __name__ == '__main__':
    main()
