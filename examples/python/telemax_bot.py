"""Minimal TeleMAX bot example.

The token is intentionally read from TELEMAX_BOT_TOKEN instead of being
hard-coded. Install with: pip install -r requirements.txt
"""
import os
import asyncio
from aiogram import Bot, Dispatcher
from aiogram.filters import Command, CommandStart
from aiogram.types import Message

TOKEN = os.environ.get("TELEMAX_BOT_TOKEN", "").strip()
if not TOKEN:
    raise RuntimeError("Set TELEMAX_BOT_TOKEN in the environment")

bot = Bot(TOKEN)
dp = Dispatcher()

@dp.message(CommandStart())
async def start(message: Message):
    await message.answer(
        f"Congratulations! You are subscribed to {getattr(bot, 'username', 'TeleMAX bot')}.\n\n"
        "Use /off to pause your subscription.\n\n"
        "📢 Posting\n/newpost - send a post to your subscribers\n"
        "/schedule - view scheduled posts\n/subscribers - subscriber count\n\n"
        "👾 Commands and Bot Menu\n/commands - manage custom commands\n\n"
        "🔧 Settings\n/botlang - set bot language\n/setdescription - change description\n"
        "/help - this menu"
    )

@dp.message(Command("help"))
async def help_command(message: Message):
    await message.answer("/start\n/help\n/commands\n/newpost\n/subscribers")

@dp.message(Command("commands"))
async def commands(message: Message):
    await message.answer("Custom commands can be registered in the TeleMAX bot manager.")

@dp.message()
async def echo(message: Message):
    await message.answer("Bot received your message. Add a custom command to change this reply.")

async def main():
    await dp.start_polling(bot)

if __name__ == "__main__":
    asyncio.run(main())
