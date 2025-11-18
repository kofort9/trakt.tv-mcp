# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an MCP (Model Context Protocol) server that wraps the Trakt.tv API, enabling AI tools like Claude Code to interact with a user's Trakt.tv profile for tracking watched shows, movies, and managing watchlists.

## MCP Server Architecture

MCP servers expose tools and resources that AI assistants can use. For this project:

- **Tools**: Define actions like adding shows to watchlist, marking episodes as watched, searching for content
- **Resources**: Expose data like user's watched history, watchlist, or profile information
- **Authentication**: Trakt.tv uses OAuth 2.0 - the server needs to handle auth flow and token management

## Trakt.tv API Integration

Key concepts from the Trakt.tv API:

- **Authentication**: Requires OAuth 2.0 device flow or standard OAuth flow
- **API Base URL**: `https://api.trakt.tv`
- **Required Headers**: All requests need `trakt-api-version` and `trakt-api-key` headers
- **Rate Limiting**: Trakt.tv enforces rate limits that must be respected
- **Content IDs**: Trakt supports multiple ID types (Trakt ID, IMDB, TMDB, TVDB) for shows/movies

## Development Setup

When implementing this project, typical MCP server setup includes:

- TypeScript-based implementation using the MCP SDK
- Configuration for client ID and client secret (stored securely, never committed)
- Server runs as a stdio or SSE transport for MCP clients
