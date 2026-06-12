# Sublemonable — Copyright (C) 2026 Sublemonable contributors
# Licensed under the GNU Affero General Public License v3.0 or later.
# SPDX-License-Identifier: AGPL-3.0-only

FROM golang:1.22-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/sublemonable-server ./cmd/server

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/sublemonable-server /usr/bin/sublemonable-server
USER nonroot
EXPOSE 8443
ENTRYPOINT ["/usr/bin/sublemonable-server"]
