#!/usr/bin/env python3
"""芒果航空后端 · 独立演示工具（不依赖 Web 服务，可直接运行）

示例：
  python scripts/demo.py cities
  python scripts/demo.py flights --from 北京 --to 上海 --date 2026-11-10
  python scripts/demo.py price 北京 上海
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services import flight_data


def cmd_cities(args):
    print("可服务城市：")
    for c in flight_data.all_cities():
        print(" -", c)


def cmd_flights(args):
    fls = flight_data.search_flights(from_city=args.frm, to_city=args.to, date=args.date)
    if not fls:
        print("未找到匹配航班（演示数据）。")
        return
    print(f"共 {len(fls)} 个航班：")
    for f in fls:
        print(f"  {f.flight_no} {f.from_city}→{f.to_city} {f.date} {f.depart}-{f.arrive} ¥{f.price} ({f.status})")


def cmd_price(args):
    fls = flight_data.search_flights(from_city=args.frm, to_city=args.to)
    if not fls:
        print("无该航线演示数据。")
        return
    prices = [f.price for f in fls]
    print(f"{args.frm}→{args.to} 最低 ¥{min(prices)}，最高 ¥{max(prices)}，平均 ¥{sum(prices)//len(prices)}")


def main():
    p = argparse.ArgumentParser(description="芒果航空后端独立演示工具")
    sub = p.add_subparsers(dest="cmd")

    sub.add_parser("cities", help="列出可服务城市")
    pf = sub.add_parser("flights", help="查询航班")
    pf.add_argument("--from", dest="frm", help="出发城市，如 北京")
    pf.add_argument("--to", help="到达城市，如 上海")
    pf.add_argument("--date", help="日期 YYYY-MM-DD")
    pp = sub.add_parser("price", help="航线价格概览")
    pp.add_argument("frm", help="出发城市")
    pp.add_argument("to", help="到达城市")

    args = p.parse_args()
    if args.cmd == "cities":
        cmd_cities(args)
    elif args.cmd == "flights":
        cmd_flights(args)
    elif args.cmd == "price":
        cmd_price(args)
    else:
        p.print_help()


if __name__ == "__main__":
    main()
