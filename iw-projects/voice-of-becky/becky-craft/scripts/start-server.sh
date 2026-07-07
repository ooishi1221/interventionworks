#!/bin/bash
# PaperMC サーバ起動（becky-craft）
cd "$(dirname "$0")/../server"
# ponytail: JDK26 で spark(async-profiler) が SIGSEGV するため無効化。JDK21 に揃えるなら外してよい
exec /opt/homebrew/opt/openjdk/bin/java -Xms1G -Xmx2G -Dspark.disableBackgroundProfiler=true -jar paper-1.21.4-232.jar --nogui
