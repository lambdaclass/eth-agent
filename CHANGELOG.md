# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1] - 2025-01-23

### Changed
- First public release to npm

## [0.1.0] - 2025-01-23

### Added
- Initial release of eth-agent
- `AgentWallet` - Main wallet interface for AI agents
- Stablecoin support: USDC, USDT, USDS, DAI, PYUSD, FRAX
- Multi-chain support: Ethereum, Arbitrum, Optimism, Base, Polygon, Avalanche
- Safety features:
  - Spending limits (per-transaction, hourly, daily, weekly)
  - Human-in-the-loop approval system
  - Transaction simulation
  - Address whitelisting/blacklisting
- AI framework integrations:
  - Anthropic Claude tools
  - OpenAI function calling
  - LangChain tools
  - Model Context Protocol (MCP) server
- ERC-4337 smart account support
- Session keys for delegated signing
- Structured error handling with recovery suggestions
- Result types (Ok/Err) for explicit error handling
- Claude Code skill for eth-agent

### Fixed
- `formatUnits` bug when decimals=0
