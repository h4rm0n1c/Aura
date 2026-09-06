import type { HumanPrincipal } from "../../../packages/core/src/auth/principals.ts";
import { AURA_MARK_INLINE } from "./brand.ts";

const CSP = [
  "default-src 'self'",
  "script-src 'none'",
  "style-src 'self'",
  "img-src 'self'",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
].join("; ");

export interface BoardNavItem {
  readonly slug: string;
  readonly title: string;
}

const HUMAN_ICON_DATA = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA1MTIgNTEyIiByb2xlPSJpbWciIGFyaWEtbGFiZWw9IkF1cmEgaHVtYW4gaGFuZCBpY29uIj4KICA8ZGVmcz4KICAgIDxmaWx0ZXIgaWQ9ImF1cmEtZ2xvdyIgeD0iLTQwJSIgeT0iLTQwJSIgd2lkdGg9IjE4MCUiIGhlaWdodD0iMTgwJSI+CiAgICAgIDxmZUdhdXNzaWFuQmx1ciBzdGREZXZpYXRpb249IjQiIHJlc3VsdD0iYmx1ciIvPgogICAgICA8ZmVNZXJnZT48ZmVNZXJnZU5vZGUgaW49ImJsdXIiLz48ZmVNZXJnZU5vZGUgaW49IlNvdXJjZUdyYXBoaWMiLz48L2ZlTWVyZ2U+CiAgICA8L2ZpbHRlcj4KICA8L2RlZnM+CiAgPHBhdGggZD0iTSAzNjQuMjUxLDMyOC4xMzcgTCAzNjIuNzg5LDMyOC41MTUgTCAzNjIuMTMyLDMyNy42ODAgTCAzNjcuNzU4LDMxOC4zNzEgTCAzNzIuNDA3LDMwOS4wNjIgTCAzNzYuNzAwLDI5OS43NTMgTCAzOTEuNTM3LDI2NC4zNzggTCAzOTcuNzgzLDI1MS4zNDUgTCA0MDAuODIzLDI0Ni40MTcgTCA0MDguMTM3LDIzNy43NTIgTCA0MTUuNDUxLDIzMi4yMjIgTCA0MjIuNzY2LDIyOC42NTQgTCA0MjcuOTE0LDIyNy4xNDIgTCA0MzQuNDY5LDIyNi42MzYgTCA0MzYuMTA2LDIyNy4xNDIgTCA0MzYuOTkwLDIyOS4wMDQgTCA0MzYuMzc4LDIzNC41ODkgTCA0MzQuNjk0LDI0MC4xNzUgTCA0MzEuNzA1LDI0Ny42MjIgTCA0MTguNTU3LDI3NS41NDkgTCA0MDguODY5LDI5MC40NDQgTCA0MDEuNzMwLDI5OS43NTMgTCAzOTQuOTcxLDMwNy40NDcgTCAzODAuMjAyLDMxOC4zNzEgTCAzNjQuMjUxLDMyOC4xMzcgWiBNIDEwNS4zMjYsNDQ1LjAzMyBMIDEwMy44NjMsNDQ1LjgxMSBMIDEwMC45MzcsNDQyLjE1NiBMIDUyLjY2MywzNzguMjEyIEwgNTIuNDA5LDM3Ni4wODcgTCAxMTguNDkxLDI5NS43MzggTCAxMzguOTcxLDI3MS42MjcgTCAxNDkuMjExLDI2Mi4wNTQgTCAxNTYuNTI2LDI1Ni41ODEgTCAxNjguMjI5LDI0OS4wNjkgTCAxNzUuNTQzLDI0NS42ODMgTCAxODEuMzk0LDI0My42NzMgTCAxODguNzA5LDI0MS42NDkgTCAxOTcuNDg2LDI0MC4yMTQgTCAyMDcuNzI2LDI0MC4wMjEgTCAyMTcuOTY2LDI0MS41NjMgTCAyMjkuNjY5LDI0NS4yNzggTCAyMzguNDQ2LDI0OS4yMjYgTCAyNjQuNzc3LDI2Ny4wMTMgTCAyNzAuNjI5LDI3MC40ODQgTCAyNzkuNDA2LDI3NC40NjMgTCAyOTEuMTA5LDI3Ny42ODAgTCAzMDEuMzQ5LDI3OS41ODEgTCAzMTcuNDQwLDI4MS4xMTMgTCAzMzYuNDU3LDI4MS44MDcgTCAzNDIuMzA5LDI4My44MTUgTCAzNDUuMjM0LDI4Ni44MzAgTCAzNDcuMjA2LDI5MC40NDQgTCAzNDcuNjU1LDI5Mi4zMDUgTCAzNDguMDM4LDI5Ni4wMjkgTCAzNDcuNzYyLDI5OS43NTMgTCAzNDcuMDE0LDMwMy40NzYgTCAzNDUuNjAzLDMwNy4yMDAgTCAzNDAuOTIxLDMxNC42NDcgTCAzMzQuOTk0LDMyMC43MDYgTCAzMjkuMTQzLDMyNC4wNzMgTCAzMjMuMjkxLDMyNi4zNzUgTCAzMTUuOTc3LDMyOC4wMzkgTCAzMTEuNTg5LDMyOC40MjYgTCAzMDIuODExLDMyOC42NDYgTCAyOTIuNTcxLDMyOC4xNzAgTCAyODAuODY5LDMyNi4xNTggTCAyNDguNjg2LDMxNy41MTggTCAyMzguNDQ2LDMxNS44MDIgTCAyMzQuMDU3LDMxNi4wNDAgTCAyMzEuMTMxLDMxNy4zMjEgTCAyMjkuNjY5LDMxOC41MzcgTCAyMjguNTk3LDMyMC4yMzMgTCAyMjguMTA5LDMyMi4wOTUgTCAyMjguMTc1LDMyMy45NTYgTCAyMjkuNTM2LDMyNy42ODAgTCAyMzIuNTk0LDMzMC4wNzMgTCAyMzYuOTgzLDMzMC44OTQgTCAyNDcuMjIzLDMzNC43OTUgTCAyNjkuMTY2LDM0NS4xMzEgTCAyOTUuNDk3LDM1Ni4wMTggTCAzMDguNjYzLDM2MC4wMzIgTCAzMTUuOTc3LDM2MS42MDYgTCAzMjMuMjkxLDM2MS45MzYgTCAzMjkuMTQzLDM2MS40NDMgTCAzNDAuODQ2LDM1OC4zNzcgTCAzNDYuNjk3LDM1Ni4wMTYgTCAzNTguNDAwLDM1MC4xOTQgTCAzNjQuMjUxLDM0Ny4wNTAgTCAzODMuMTU3LDMzNS4xMjcgTCAzOTYuNDM0LDMyNi40MTMgTCA0MDEuODgzLDMyMi4wOTUgTCA0MDkuMDQ5LDMxNC42NDcgTCA0MTkuMjAxLDMwMS42MTUgTCA0MjguODQzLDI4Ni43MjAgTCA0NDcuMjAyLDI1NS4wNjkgTCA0NTMuNDg2LDI0Ni42ODAgTCA0NTYuNDExLDI0My41NTggTCA0NTkuMzM3LDI0MS4zOTMgTCA0NjIuMjYzLDIzOS41NDIgTCA0NjYuNjUxLDIzNy43MDcgTCA0NzUuNDI5LDIzNy4wMDIgTCA0NzguMzU0LDIzNy42MDIgTCA0ODEuMjgwLDIzOS4yMDkgTCA0ODIuNzQzLDI0MC44NzMgTCA0ODQuMDg4LDI0My44OTggTCA0ODQuMjY2LDI0Ny42MjIgTCA0ODIuODI0LDI1My4yMDcgTCA0NzUuODYxLDI2OS45NjQgTCA0NjUuNTIzLDI5Mi4zMDUgTCA0NTIuNDA2LDMxOC4zNzEgTCA0NDMuMjQ2LDMzNC42NTggTCA0MzMuNTMxLDM1MC4wMjIgTCA0MjYuNjM1LDM1OS4zMzEgTCA0MjEuMzAzLDM2NS4xMzAgTCA0MTYuOTE0LDM2OS4wOTYgTCA0MDUuMjExLDM3OC42NDcgTCAzNTkuODYzLDQxMi4zODEgTCAzMzYuNDU3LDQyOS4xNDMgTCAzMjEuMTcyLDQzOS4zODkgTCAzMTUuOTc3LDQ0MS43MjcgTCAzMDcuMjAwLDQ0My44ODIgTCAyOTguNDIzLDQ0NC4wNjcgTCAyOTIuNTcxLDQ0My4yNTQgTCAyNzkuNDA2LDQzNy45MzYgTCAyMzYuOTgzLDQxNC43MDIgTCAyMTcuOTY2LDQwNS4zNjQgTCAyMDkuMTg5LDQwMS42MjMgTCAxOTQuNTYwLDM5Ni4zNDMgTCAxODEuMzk0LDM5Mi42MTYgTCAxNzEuMTU0LDM5MC40OTQgTCAxNjMuODQwLDM5MC4yODIgTCAxNTMuNjAwLDM5Mi4yNzkgTCAxNDYuMjg2LDM5NS45MTYgTCAxNDAuNDM0LDM5OS45MDggTCAxMzMuMTIwLDQwNy44MzggTCAxMDUuMzI2LDQ0NS4wMzMgWiIgZmlsbD0iI0YyRjBFQiIgZmlsbC1ydWxlPSJldmVub2RkIi8+CiAgPHBhdGggZD0iTSAzMTQuNTE0LDIzNy4xNTggTCAzMTQuMTM3LDIzNi40NTEgTCAzMTMuNzM0LDIzMi43MjcgTCAzMTIuMTYyLDIxMC4zODUgTCAzMTAuNTU0LDE5NS40OTEgTCAzMDkuNzk5LDE5MS43NjcgTCAzMDkuMDE5LDE4NC4zMjAgTCAzMDcuNTg0LDE3Ni44NzMgTCAzMDQuNDE4LDE2NS43MDIgTCAzMDEuOTY4LDE2MC4xMTYgTCAyOTguNDIzLDE1NC42NDkgTCAyOTUuMDA4LDE1MC44MDcgTCAyOTAuODQxLDE0Ny4wODQgTCAyODQuNjE3LDE0My4zNjAgTCAyNzkuNDA2LDE0MS4yODYgTCAyNjQuNzc3LDEzNy43MjkgTCAyNTMuMDc0LDEzNS41OTUgTCAyNDUuNzYwLDEzNS4wMzggTCAyNDIuMTg5LDEzNC4wNTEgTCAyNDUuNzYwLDEzMi44MzYgTCAyNjAuMzg5LDEzMC4zNjIgTCAyODAuNzYzLDEyNC43NDIgTCAyODQuOTY5LDEyMi44ODAgTCAyOTAuOTIyLDExOS4xNTYgTCAyOTQuOTcwLDExNS40MzMgTCAyOTguNDIzLDExMC45NTggTCAzMDEuMzQ5LDEwNS45OTMgTCAzMDQuNTI0LDk4LjY3NiBMIDMwNy43MjcsODUuNjQ0IEwgMzEwLjM5NSw2Ny4wMjUgTCAzMTMuOTQyLDI3LjkyNyBMIDMxNC41MTQsMjYuOTU0IEwgMzE1LjAxNSwyNy45MjcgTCAzMTcuMTQ0LDU1Ljg1NSBMIDMyMC4xNzMsODEuOTIwIEwgMzIxLjUwNyw4OS4zNjcgTCAzMjMuMjkxLDk2LjE5MSBMIDMyNC43MjksMTAwLjUzOCBMIDMyOS4xNDMsMTA5LjM0NyBMIDMzMi4yODAsMTEzLjU3MSBMIDMzNi40NTcsMTE3LjkzOSBMIDM0MC45MTAsMTIxLjAxOCBMIDM0NS4yMzQsMTIzLjE5NCBMIDM1NS40NzQsMTI2LjgxNSBMIDM2Mi4yNjUsMTI4LjQ2NSBMIDM3MS41NjYsMTMwLjQ4NyBMIDM4NS4yNjksMTMyLjE4OSBMIDM4NC42MjQsMTM0LjA1MSBMIDM3My4wMjksMTM1LjM0OCBMIDM2MS4zMjYsMTM3LjczMCBMIDM1NC4wMTEsMTM5LjYyNiBMIDM0NC4wMjAsMTQzLjM2MCBMIDM0MC44NDYsMTQ0Ljk2NCBMIDMzNi40NTcsMTQ4LjE4NiBMIDMzMi4wNjksMTUyLjQyOCBMIDMyOS4wODMsMTU2LjM5MyBMIDMyNi4wMzAsMTYxLjk3OCBMIDMyMy4xNDksMTY5LjQyNSBMIDMyMS41MzcsMTc1LjAxMSBMIDMyMC4wNjUsMTgyLjQ1OCBMIDMxOS40NjEsMTg4LjA0NCBMIDMxOC42MjUsMTkxLjc2NyBMIDMxOC4wODgsMTk5LjIxNSBMIDMxNy4wODcsMjA0LjgwMCBMIDMxNS42NDMsMjIzLjQxOCBMIDMxNS4yODUsMjMyLjcyNyBMIDMxNC44OTQsMjM2LjQ1MSBMIDMxNC41MTQsMjM3LjE1OCBaIiBmaWxsPSIjRDhGRjNGIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiIGZpbHRlcj0idXJsKCNhdXJhLWdsb3cpIi8+Cjwvc3ZnPg==";
const AGENT_ICON_DATA = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA1MTIgNTEyIiByb2xlPSJpbWciIGFyaWEtbGFiZWw9IkF1cmEgYWdlbnQgaGFuZCBpY29uIj4KICA8ZGVmcz4KICAgIDxmaWx0ZXIgaWQ9ImF1cmEtZ2xvdyIgeD0iLTQwJSIgeT0iLTQwJSIgd2lkdGg9IjE4MCUiIGhlaWdodD0iMTgwJSI+CiAgICAgIDxmZUdhdXNzaWFuQmx1ciBzdGREZXZpYXRpb249IjQiIHJlc3VsdD0iYmx1ciIvPgogICAgICA8ZmVNZXJnZT48ZmVNZXJnZU5vZGUgaW49ImJsdXIiLz48ZmVNZXJnZU5vZGUgaW49IlNvdXJjZUdyYXBoaWMiLz48L2ZlTWVyZ2U+CiAgICA8L2ZpbHRlcj4KICA8L2RlZnM+CiAgPHBhdGggZD0iTSA0MTkuOTg4LDIzNC45NjggTCA0MTcuMDIwLDIzNi4zNDcgTCA0MTUuNTM2LDIzNS40MDcgTCAzODYuMTk3LDIxNC4xMDkgTCAzODYuMTAxLDIxMi4yNDcgTCA0MzYuMzEzLDE1OS41MTAgTCA0NDkuNjcwLDE0NS44NDAgTCA0NTEuMTU0LDE0NS4zNzcgTCA0NTIuODkwLDE0OC45NDUgTCA0NjAuNTIyLDE2OS40MjUgTCA0NjguOTAxLDE5My42MjkgTCA0NjguMDU3LDE5NS40OTEgTCA0NjMuMDI2LDE5OS45MzMgTCA0MTkuOTg4LDIzNC45NjggWiBNIDM5Ny43MjgsMzU3LjUzNSBMIDM5MS43OTEsMzU3Ljk3MSBMIDM5MC42NTMsMzU3LjQ2OSBMIDM5MC42NTUsMzU1LjYwNyBMIDM5Mi44MzksMzUzLjc0NSBMIDM5Ny43MjgsMzQ3Ljg4NCBMIDQwMS4zNDUsMzQyLjU3NSBMIDQwNC4yNDIsMzM2Ljk4OSBMIDQwNS43NTMsMzMzLjI2NSBMIDQwOC4yNTAsMzIzLjk1NiBMIDQwOS45NjQsMzEwLjkyNCBMIDQwOS44ODUsMzAzLjQ3NiBMIDQwOC41NzMsMjkyLjMwNSBMIDQwNS45MTAsMjgyLjk5NiBMIDQwMS44NDIsMjczLjY4NyBMIDQwMi4xODAsMjcyLjgzNiBMIDQwOS42MDAsMjY1Ljc5NiBMIDQ0OC4xODYsMjMyLjUyNSBMIDQ3My40MTQsMjExLjcyOCBMIDQ3NC44OTksMjExLjAyNSBMIDQ3Ni4wMTIsMjEyLjI0NyBMIDQ3Ni44NDUsMjE0LjEwOSBMIDUwMS4wMjEsMjgyLjk5NiBMIDUwMS4yNzAsMjg0Ljg1OCBMIDUwMC4xMjgsMjg2LjMwMSBMIDQ5MS4yMjMsMjkyLjgyNyBMIDQxMi41NjgsMzQ3LjQxNCBMIDQwMC42OTYsMzU2LjEwOCBMIDM5Ny43MjgsMzU3LjUzNSBaIE0gMzkwLjMwNywyNTguODQ2IEwgMzgyLjg4NywyNTMuMTAxIEwgMzc4LjQzNSwyNTAuNjUzIEwgMzczLjk4MywyNDguOTMxIEwgMzYyLjExMCwyNDYuODQ3IEwgMzUxLjM3NiwyNDcuNjIyIEwgMzUxLjkyNSwyNDUuNzYwIEwgMzcxLjAxNCwyMjcuMDM4IEwgMzc4LjQzNSwyMjAuMjcxIEwgMzc5LjkxOSwyMjAuMjM2IEwgNDAzLjI4NSwyMzYuNDUxIEwgNDEwLjIyMiwyNDIuMDM2IEwgNDA4Ljc2MywyNDMuODk4IEwgMzkxLjc5MSwyNTguMzY1IEwgMzkwLjMwNywyNTguODQ2IFogTSAxMDIuNDAwLDI4NC4wMTQgTCAxMDAuOTE2LDI4My42NTcgTCA5Ny4xMjgsMjczLjY4NyBMIDg1LjAzOCwyNDcuNjIyIEwgNzcuODQzLDIzNC41ODkgTCA3Ny44MjgsMjMyLjcyNyBMIDc4LjM2MywyMzAuODY1IEwgODAuMTM5LDIyOC42MDcgTCA4Ni4wNzUsMjI2LjQyOSBMIDkyLjAxMiwyMjYuMjA2IEwgOTQuOTgwLDIyNi44ODQgTCA5OS40MzIsMjMwLjAxNiBMIDEwMi41MTcsMjM0LjU4OSBMIDExNC45ODcsMjY0LjM3OCBMIDExNi41MjEsMjY5Ljk2NCBMIDExNi4zNDksMjcxLjgyNSBMIDExNS43NTcsMjcyLjc5NyBMIDEwMi40MDAsMjg0LjAxNCBaIE0gMTQ2LjkyMiwyOTYuOTMyIEwgMTQ1LjQzOCwyOTYuNjczIEwgMTQyLjg2OCwyOTIuMzA1IEwgMTM4LjAxNywyODYuMjU4IEwgMTM2LjM0NSwyODIuOTk2IEwgMTMyLjQ4MywyNjguMTAyIEwgMTI1LjgwOCwyNDUuNzYwIEwgMTI3LjU3OCwyNDIuMDM2IEwgMTI5LjExMywyNDAuODc3IEwgMTMzLjU2NSwyMzkuNTY5IEwgMTM5LjUwMSwyMzkuNjQ2IEwgMTQzLjk1NCwyNDEuNDkzIEwgMTQ2LjkyMiwyNDQuMDM3IEwgMTUwLjQ2OCwyNDkuNDg0IEwgMTYxLjA4NywyNzkuMjczIEwgMTYyLjAxMywyODIuOTk2IEwgMTYxLjgxNywyODQuODU4IEwgMTYwLjc0NCwyODYuNzIwIEwgMTQ2LjkyMiwyOTYuOTMyIFogTSA2OC4yNjcsMzA4LjAwNSBMIDY2Ljc4MywzMDguNDIzIEwgNjUuMTYxLDMwNS4zMzggTCA0NS4yNjQsMjU2LjkzMSBMIDQ0Ljg0NSwyNTUuMDY5IEwgNDQuNDc5LDI1MS4zNDUgTCA0NS40MTAsMjQ3LjYyMiBMIDQ4Ljk3NCwyNDMuNjE5IEwgNTMuNDI2LDI0MS40OTMgTCA1Ny44NzgsMjQwLjc2OCBMIDYyLjMzMCwyNDEuMzg3IEwgNjYuNzgzLDI0My43MzIgTCA2OS43NTEsMjQ2Ljg1NiBMIDcxLjQ2NiwyNDkuNDg0IEwgODAuNTY2LDI2OC4xMDIgTCA4Ny45NDYsMjg0Ljg1OCBMIDg3LjgzMSwyODguNTgyIEwgODYuNjM5LDI5MC40NDQgTCA2OC4yNjcsMzA4LjAwNSBaIE0gMTQ5Ljg5MCwzNDkuNjgyIEwgMTQ1LjQzOCwzNDkuMDQyIEwgMTQ0LjIzOSwzNDguMTYwIEwgMTQwLjM5OCwzNDAuNzEzIEwgMTEwLjU5MCwyOTkuNzUzIEwgMTExLjQxMSwyOTcuODkxIEwgMTIwLjIwOSwyODkuOTY4IEwgMTIzLjE3NywyODcuODQzIEwgMTI0LjY2MSwyODcuOTkzIEwgMTI4LjM4NSwyOTIuMzA1IEwgMTUxLjg4MywzMjkuNTQyIEwgMTU0Ljg5NywzMzUuMTI3IEwgMTU1LjI0MCwzMzYuOTg5IEwgMTUyLjc2NSwzNDIuNTc1IEwgMTUxLjM2OCwzNDguMTYwIEwgMTQ5Ljg5MCwzNDkuNjgyIFogTSAyNTUuMjU4LDM3OS45NjUgTCAyNTAuODA2LDM4MS4zOTMgTCAyNDQuODcwLDM4MS4yMjcgTCAyMzguOTMzLDM3OS40NDIgTCAyMjUuNTc3LDM3Ni43MTAgTCAyMjIuNzIzLDM3NC4yMjUgTCAyMjEuMTc4LDM3MC41MDIgTCAyMjAuODY5LDM2Ni43NzggTCAyMjMuMjE5LDMzNi45ODkgTCAyMjMuNjE2LDMzNS4xMjcgTCAyMjQuNjQ3LDMzMy4yNjUgTCAyMjUuNTc3LDMzMi4yOTggTCAyMjguNTQ1LDMzMC44OTQgTCAyMzQuNDgxLDMzMC4yNzYgTCAyMzUuOTY1LDMyOS42MDcgTCAyNDYuMzU0LDMyMy4xODIgTCAyNTguMjI2LDMxNy4wODUgTCAyNzMuMDY3LDMwOC4yMTcgTCAyOTguMjk2LDI5NC42NDggTCAyOTkuNzgwLDI5NC4xMDAgTCAzMDEuMjY0LDI5NC41MzggTCAzMDcuMjAwLDI5OC4yMzEgTCAzMDguNTMzLDI5OS43NTMgTCAzMDcuNzY0LDMwOS4wNjIgTCAzMDguMTUwLDMxOC4zNzEgTCAzMDkuODgxLDMyNy42ODAgTCAzMTIuMTk5LDMzNS4xMjcgTCAzMTEuNzM1LDMzOC44NTEgTCAzMTAuMTY4LDM0My44NzAgTCAzMDEuMjY0LDM1MC4zODYgTCAyOTMuODQzLDM1NC43OTcgTCAyNjEuMTk0LDM3Ni43ODAgTCAyNTUuMjU4LDM3OS45NjUgWiBNIDE2NC43MzAsMzI0LjAzNiBMIDE2My4yNDYsMzI0Ljc1MiBMIDE2MS43NjIsMzIzLjAzOSBMIDE1NS4xMzIsMzEyLjc4NSBMIDE1NS4yNjIsMzEwLjkyNCBMIDE2MC4yNzgsMzA2LjQ3NSBMIDE2Ny42OTksMzAwLjk1OSBMIDE2OS4xODMsMzAxLjAwMCBMIDE3MS45MzYsMzAzLjQ3NiBMIDE3NC42MzIsMzA3LjIwMCBMIDE3OS4yMDcsMzE0LjY0NyBMIDE3OS43NTAsMzE2LjUwOSBMIDE3Mi4xNTEsMzE5LjQyMCBMIDE2NC43MzAsMzI0LjAzNiBaIE0gMTE4LjcyNSwzODcuMjUxIEwgMTE3LjI0MSwzODYuNzU5IEwgMTA5LjQwMSwzNzYuMDg3IEwgODEuMjU0LDMzNS4xMjcgTCA3NS42MDAsMzI1LjgxOCBMIDc1Ljg0OCwzMjMuOTU2IEwgNzcuMjkxLDMyMi4wOTUgTCA5Mi4wMTIsMzA2LjQ0MiBMIDk0Ljk4MCwzMDQuMDkyIEwgOTcuOTQ4LDMwNC4yNTEgTCA5OS40MzIsMzA1LjU1MiBMIDEyOC4wMTUsMzQ0LjQzNiBMIDEzNC4xMDEsMzUzLjc0NSBMIDEzNC41MjksMzU1LjYwNyBMIDEzNC4zNjEsMzU3LjQ2OSBMIDEzMi43MDQsMzYxLjE5MyBMIDEyMi4xODMsMzgxLjY3MyBMIDExOC43MjUsMzg3LjI1MSBaIE0gMjA2LjI4NCwzNjguMzk0IEwgMTk1Ljg5NiwzNjUuNDA2IEwgMTY0LjczMCwzNTQuMTA0IEwgMTY0LjE1OSwzNTEuODg0IEwgMTY1LjcxNiwzNDYuMjk4IEwgMTY3LjI4MCwzNDIuNTc1IEwgMTcwLjY2NywzMzguMDA3IEwgMTcyLjE1MSwzMzYuNTA5IEwgMTc4LjA4NywzMzIuNjg0IEwgMTg0LjAyMywzMzAuNjgxIEwgMTg2Ljk5MSwzMzAuMzI1IEwgMTk1Ljg5NiwzMzAuMDM5IEwgMjA3Ljc2OCwzMzAuNjA2IEwgMjA4LjY4MiwzMzEuNDA0IEwgMjA5LjYwNSwzMzMuMjY1IEwgMjA5LjU3MSwzMzUuMTI3IEwgMjA3LjI0OCwzNjYuNzc4IEwgMjA2LjI4NCwzNjguMzk0IFogTSAyNjIuNjc4LDQ0My4xOTAgTCAyNTAuODA2LDQ0My42NTUgTCAyMzUuOTY1LDQ0MS41NTEgTCAyMzMuMzU0LDQzOS4zODkgTCAyMzIuMzUyLDQzNy41MjcgTCAyMzIuMDgyLDQzNS42NjUgTCAyMzQuNzE1LDQyMi42MzMgTCAyMzcuNzg4LDQwNC4wMTUgTCAyMzguOTMzLDQwMS4zNTIgTCAyNDEuOTAxLDM5OC40NjkgTCAyNDQuODcwLDM5Ny4zODcgTCAyNTIuMjkwLDM5Ni44MjAgTCAyNTYuNzQyLDM5NS45MDkgTCAyNjIuNjc4LDM5My43MTkgTCAyNzcuNTE5LDM4NC40NzEgTCAzMTEuNjUyLDM2MS43NDggTCAzMTYuMTA0LDM1OC4yMDUgTCAzMjMuNTI1LDM1Ni4xODQgTCAzMjYuNDkzLDM1NC41OTcgTCAzMjcuOTc3LDM1NC45MjcgTCAzMzAuOTQ1LDM1Ny44ODYgTCAzMzguMzY1LDM2My42MjcgTCAzNDcuMjcwLDM2Ny42NjQgTCAzNTQuNjkwLDM2OS4zOTkgTCAzNjUuMDc4LDM2OS42MjEgTCAzNjUuNjc0LDM3MC41MDIgTCAzNjcuMjkzLDM3Ni4wODcgTCAzNjcuNjY5LDM3OS44MTEgTCAzNjcuMDY0LDM4MS42NzMgTCAzNjMuNTk0LDM4Ni4wNDMgTCAyOTYuODEyLDQyNi45MTEgTCAyNzguNjQ3LDQzNy41MjcgTCAyNzQuNTUxLDQzOS44MjQgTCAyNzAuMDk5LDQ0MS41NzEgTCAyNjIuNjc4LDQ0My4xOTAgWiBNIDIxNi42NzIsNDM0LjM0NCBMIDIxNS4xODgsNDM1LjAwMSBMIDIxMi4yMjAsNDM0LjQxOCBMIDEzNi41MzMsNDAyLjc5NiBMIDEzMy41NjUsNDAxLjI5NSBMIDEzMi42OTcsNDAwLjI5MSBMIDEzMS42MTQsMzk4LjQyOSBMIDEzMS41NDAsMzk2LjU2NyBMIDEzMi45NzEsMzkyLjg0NCBMIDEzOS44OTksMzc5LjgxMSBMIDE0NC45NTAsMzY4LjY0MCBMIDE0Ni45MjIsMzY2LjU0MiBMIDE0OC40MDYsMzY2LjA1NSBMIDE1Mi44NTgsMzY2LjI4OSBMIDIxNy43MzUsMzg5LjEyMCBMIDIxOS42NDEsMzkwLjIzOCBMIDIyMS42MzEsMzkyLjg0NCBMIDIyNC4wNDIsMzk4LjQyOSBMIDIxOC44MDIsNDMwLjA4MCBMIDIxOC4zNzIsNDMxLjk0MiBMIDIxNi42NzIsNDM0LjM0NCBaIiBmaWxsPSIjRjJGMEVCIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiLz4KICA8cGF0aCBkPSJNIDI1My43NzQsMjQ3LjIxOSBMIDI1Mi42OTMsMjQyLjAzNiBMIDI1Mi4zNDEsMjM0LjU4OSBMIDI0OS40NjQsMjA0LjgwMCBMIDI0Ny44MzgsMTkzLjk2OSBMIDI0Ni4zNTQsMTg2Ljg2NiBMIDI0NC44NzAsMTgxLjAwMyBMIDI0Mi4yMDQsMTczLjE0OSBMIDIzOS40MjcsMTY3LjU2NCBMIDIzNS45NjUsMTYyLjMwNCBMIDIzMC4wMjksMTU2LjMwOCBMIDIyNC4wOTMsMTUyLjMzMCBMIDIxOS42NDEsMTUwLjMyOCBMIDIwNC44MDAsMTQ2LjE0MCBMIDE4OC40NzUsMTQzLjM1NiBMIDE3OC4wODcsMTQyLjQ4NCBMIDE3NC44NTIsMTQxLjQ5OCBMIDE3Ni42MDMsMTQwLjQ5NiBMIDE4MS4wNTUsMTM5LjI5NiBMIDE4OS45NTksMTM3Ljk4MiBMIDIwNi4yODQsMTM0LjQwOSBMIDIxOC4xNTcsMTMwLjc1MCBMIDIyMi42MDksMTI4LjU3MCBMIDIyOC41NDUsMTI0Ljc2OCBMIDIzMi44MTMsMTIxLjAxOCBMIDIzNS45OTUsMTE3LjI5NSBMIDIzOS40NDIsMTExLjcwOSBMIDI0MS45MDEsMTA2LjA5OSBMIDI0Ni4zNTQsOTEuMTA2IEwgMjQ3LjgzOCw4My40NDEgTCAyNDkuMzIyLDcyLjM4OCBMIDI1Mi4yOTIsNDQuNjg0IEwgMjUyLjg2OCwzMy41MTMgTCAyNTMuNzc0LDI4Ljk2OSBMIDI1NC43OTIsMzMuNTEzIEwgMjU2LjQxNiw1My45OTMgTCAyNTkuMjQ5LDc4LjE5NiBMIDI2MC45ODEsODkuMzY3IEwgMjYyLjU5NCw5Ni44MTUgTCAyNjUuNjM2LDEwNi4xMjQgTCAyNjguMjYwLDExMS43MDkgTCAyNzEuNTgzLDExNi44MTIgTCAyNzMuMzk4LDExOS4xNTYgTCAyNzcuNTE5LDEyMy4xMzggTCAyODMuNDU1LDEyNi42MTggTCAyOTIuMzU5LDEzMC40NDggTCAzMDcuMjAwLDEzNC4wNjggTCAzMTcuNTg4LDEzNi4wMTAgTCAzMjcuOTc3LDEzNy4wMDggTCAzMzAuNTI0LDEzNy43NzUgTCAzMjkuNDYxLDEzOC41MzMgTCAzMjUuOTQ3LDEzOS42MzYgTCAzMTYuMTA0LDE0MS4xODEgTCAyOTkuNzgwLDE0NC44ODggTCAyODkuMzkxLDE0OC40MzEgTCAyODQuOTM5LDE1MC40NDEgTCAyNzkuMDAzLDE1NC4yMzEgTCAyNzQuNTUxLDE1OC4wMDggTCAyNzEuMjMxLDE2MS45NzggTCAyNjcuODM3LDE2Ny41NjQgTCAyNjUuMTQ0LDE3My4xNDkgTCAyNjMuNzg1LDE3Ni44NzMgTCAyNjAuNzYwLDE4OC4wNDQgTCAyNTkuNjYzLDE5My42MjkgTCAyNTcuMzk2LDIxMC4zODUgTCAyNTUuMTYzLDIzMC44NjUgTCAyNTQuNTUwLDI0My44OTggTCAyNTMuNzc0LDI0Ny4yMTkgWiBNIDM2MC42MjYsMzUxLjkwOCBMIDM1MS43MjIsMzUwLjgwMSBMIDM0Ny4yNzAsMzQ5LjE1MyBMIDM0MS4zMzMsMzQ1LjQ0MiBMIDMzNi44ODEsMzQxLjMxOCBMIDMzMy40NjksMzM2Ljk4OSBMIDMzMC4xNzIsMzMxLjQwNCBMIDMyNy4xNjQsMzIzLjk1NiBMIDMyNS44MzcsMzE4LjM3MSBMIDMyNS4zNDgsMzA5LjA2MiBMIDMyNS44MDEsMjk5Ljc1MyBMIDMyNy41NTgsMjkyLjMwNSBMIDMzMC43NjYsMjg0Ljg1OCBMIDMzNS4zOTcsMjc4LjAxMSBMIDMzOS44NDksMjczLjIyMyBMIDM0NS43ODYsMjY4LjgwMCBMIDM1My4yMDYsMjY1LjcwNyBMIDM2MC42MjYsMjY0Ljg3MiBMIDM2OC4wNDYsMjY1LjY1NiBMIDM3My45ODMsMjY3Ljg4NCBMIDM3Ni45NTEsMjY5LjUyNSBMIDM4MS40MDMsMjcyLjg3OCBMIDM4NS44NTUsMjc3LjgwMiBMIDM4OS41NTIsMjgyLjk5NiBMIDM5My42OTEsMjkyLjMwNSBMIDM5NS40ODIsMjk5Ljc1MyBMIDM5NS45NDgsMzA5LjA2MiBMIDM5NS41MDQsMzE2LjUwOSBMIDM5My42NzcsMzIzLjk1NiBMIDM5MC43ODQsMzMxLjQwNCBMIDM4NS44NTUsMzM5LjEwNyBMIDM3OS45MTksMzQ1LjA4NiBMIDM3My45ODMsMzQ4Ljc0NiBMIDM2OS41MzAsMzUwLjY0MiBMIDM2MC42MjYsMzUxLjkwOCBaIE0gMzY4LjczNiwzMzYuOTg5IEwgMzczLjk4MywzMzMuODAyIEwgMzc4LjExNSwzMjkuNTQyIEwgMzgxLjgyOCwzMjMuOTU2IEwgMzgzLjMzOCwzMjAuMjMzIEwgMzg0LjcwNywzMTQuNjQ3IEwgMzg1LjA3MywzMDkuMDYyIEwgMzg0LjczNCwzMDEuNjE1IEwgMzgzLjM3NywyOTYuMDI5IEwgMzgxLjcwNywyOTIuMzA1IEwgMzc4LjAxOSwyODYuNzIwIEwgMzczLjk4MywyODIuNTI4IEwgMzcxLjAxNCwyODAuNDk2IEwgMzY4LjA0NiwyNzkuMDM2IEwgMzYyLjExMCwyNzcuNjgzIEwgMzU5LjE0MiwyNzcuNzMxIEwgMzUzLjIwNiwyNzguOTAwIEwgMzQ5LjExNiwyODEuMTM1IEwgMzQ1Ljc4NiwyODMuODkxIEwgMzQyLjgxNywyODcuMjAyIEwgMzM5LjU1NSwyOTIuMzA1IEwgMzM3Ljk3NCwyOTYuMDI5IEwgMzM2LjIzNCwzMDMuNDc2IEwgMzM2LjE0MSwzMTIuNzg1IEwgMzM2LjY3NywzMTYuNTA5IEwgMzM3LjY4MywzMjAuMjMzIEwgMzQxLjE2MCwzMjcuNjgwIEwgMzQ0LjMwMSwzMzEuNjY4IEwgMzQ4Ljc1NCwzMzUuMjA1IEwgMzUzLjIwNiwzMzcuNDQ0IEwgMzU5LjE0MiwzMzguMzkwIEwgMzYyLjExMCwzMzguMzcxIEwgMzY4LjczNiwzMzYuOTg5IFoiIGZpbGw9IiNEOEZGM0YiIGZpbGwtcnVsZT0iZXZlbm9kZCIgZmlsdGVyPSJ1cmwoI2F1cmEtZ2xvdykiLz4KPC9zdmc+";

export const AURA_CSS = String.raw`
:root {
  color-scheme: dark;
  --bg: #000;
  --panel: #151515;
  --panel-soft: #1e1e1e;
  --field: #101010;
  --text: #fff;
  --muted: #c8c8c8;
  --line: #626262;
  --line-strong: #8a8a8a;
  --link: #82c8ff;
  --accent: #1c2407;
  --accent-line: #dffb48;
  --danger: #ff9292;
  --action-bg: #fff;
  --action-text: #000;
  --shell-width: 80vw;
  font-family: Arial, Helvetica, sans-serif;
}
html { font-size: 150%; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font-size: 1rem; line-height: 1.5; }
body > header, .board-strip, main, body > footer { font-size: 1rem; line-height: 1.5; }
a { color: var(--link); text-underline-offset: .12em; }
a:focus-visible, button:focus-visible, input:focus-visible, textarea:focus-visible, select:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
body > header { border-bottom: 1px solid var(--line-strong); background: #000; }
.bar { max-width: var(--shell-width); margin: 0 auto; padding: .48rem .8rem; display: flex; gap: 1rem; align-items: center; flex-wrap: wrap; }
.brand { display: inline-flex; align-items: center; gap: .52rem; flex: none; font-weight: 600; text-decoration: none; color: var(--text); }
.brand:hover .brand-word { text-decoration: underline; }
.brand-mark { display: block; width: 3rem; height: 2.38rem; flex: none; border-radius: 2px; }
.brand-word { font-size: 1.12rem; letter-spacing: .01em; }
nav { display: flex; gap: .8rem; flex-wrap: wrap; }
nav a { text-decoration: none; border-bottom: 1px solid transparent; }
nav a:hover { border-bottom-color: var(--line-strong); }
.identity { margin-left: auto; color: var(--muted); font-size: .95rem; }
.board-strip { display: block; border-bottom: 1px solid var(--line); background: #0a0a0a; }
.board-strip-inner { max-width: var(--shell-width); margin: 0 auto; padding: .3rem .8rem .32rem; overflow-x: auto; font-size: .95rem; scrollbar-width: thin; }
.board-strip-track { width: max-content; white-space: nowrap; text-align: left; }
.board-strip-label { display: inline-block; color: var(--muted); margin-right: .6rem; }
.board-strip a { border-bottom: 0; font-weight: 400; }
.board-strip a:hover { text-decoration: underline; }
.board-strip a[aria-current="page"] { color: var(--text); font-weight: 600; text-decoration: underline; }
.board-strip-sep { color: var(--muted); margin: 0 .26rem; }
main { max-width: var(--shell-width); margin: 0 auto; padding: .9rem .8rem; }
h1 { font-size: 1.5rem; font-weight: 700; line-height: 1.25; margin: .2rem 0 .8rem; }
h2 { font-size: 1.18rem; font-weight: 700; line-height: 1.3; margin: 1.15rem 0 .48rem; }
p { margin: .48rem 0; }
.box { border: 1px solid var(--line-strong); background: var(--panel); padding: .72rem .82rem; margin: .7rem 0; }
.notice { background: var(--accent); }
.error { border-color: var(--danger); }
dl { display: grid; grid-template-columns: max-content 1fr; gap: .35rem .85rem; margin: .55rem 0; }
dt { font-weight: 600; }
dd { margin: 0; }
form { margin: .75rem 0; }
label { display: block; font-weight: 600; margin-bottom: .25rem; }
input, textarea, select, button { font: inherit; }
input[type="text"], input[type="email"], input[type="number"], textarea, select { border: 1px solid var(--line-strong); background: var(--field); color: var(--text); padding: .48rem .54rem; }
input[type="text"], input[type="email"], textarea { width: min(100%, 42rem); }
button { border: 1px solid var(--line-strong); background: var(--panel-soft); color: var(--text); padding: .42rem .72rem; cursor: pointer; }
button:hover { border-color: var(--text); }
.meta { color: var(--muted); font-size: .95rem; }
ul.compact { margin: .45rem 0 .45rem 1.3rem; padding: 0; }
code { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; }
.secret { display: block; white-space: pre-wrap; overflow-wrap: anywhere; border: 1px solid var(--line-strong); background: var(--field); padding: .7rem; margin: .65rem 0; }
.inline { display: inline; margin-right: .5rem; }
.table-wrap { overflow-x: auto; border: 1px solid var(--line-strong); background: var(--panel); margin: .7rem 0; }
table { width: 100%; border-collapse: collapse; font-size: 1rem; }
th, td { border-bottom: 1px solid var(--line); padding: .48rem .58rem; text-align: left; vertical-align: top; }
th { white-space: nowrap; background: var(--panel-soft); color: var(--muted); font-size: .94rem; font-weight: 600; }
tr:last-child td { border-bottom: 0; }
td form.inline { display: inline-flex; gap: .4rem; align-items: center; margin: .12rem .45rem .12rem 0; }
.forum-heading { display: flex; justify-content: space-between; gap: 1rem; align-items: flex-start; flex-wrap: wrap; border-bottom: 1px solid var(--line); padding-bottom: .62rem; margin-bottom: .65rem; }
.forum-heading h1 { margin-bottom: .2rem; }
.forum-heading p { max-width: 64rem; }
.forum-actions { display: flex; gap: .45rem; align-items: center; flex-wrap: wrap; margin-top: .1rem; }
.forum-action { display: inline-block; border: 1px solid var(--line-strong); background: var(--panel-soft); padding: .3rem .56rem; color: var(--text); font-size: .95rem; font-weight: 600; text-decoration: none; }
.forum-action:hover { border-color: var(--text); color: var(--text); }
.forum-action-primary { border-color: var(--action-bg); background: var(--action-bg); color: var(--action-text); }
.forum-action-primary:hover { color: var(--action-text); filter: brightness(.9); }
.board-link { display: inline-flex; gap: .45rem; align-items: baseline; text-decoration: none; }
.board-link:hover { text-decoration: underline; }
.board-slug { font-weight: 700; }
.board-title { font-weight: 600; }
.board-description { margin-top: .16rem; color: var(--muted); font-size: .95rem; max-width: 62rem; }
.board-index .board-cell { min-width: 17rem; padding-top: .56rem; padding-bottom: .56rem; }
.board-index .count-cell, .thread-list .count-cell, .recent-thread-list .count-cell, .archive-thread-list .count-cell { width: 1%; white-space: nowrap; text-align: right; font-variant-numeric: tabular-nums; }
.board-index .activity-cell, .thread-list .activity-cell, .recent-thread-list .activity-cell, .archive-thread-list .activity-cell { width: 1%; white-space: nowrap; font-variant-numeric: tabular-nums; }
.recent-thread-list .recent-board-cell { width: 1%; white-space: nowrap; }
.recent-thread-list .recent-thread-cell { min-width: 26rem; }
.recent-thread-title { display: flex; align-items: baseline; gap: .4rem; flex-wrap: wrap; }
.recent-excerpt { margin-top: .22rem; color: var(--muted); font-size: 1rem; line-height: 1.45; max-width: 74rem; }
.recent-excerpt-ref { margin-right: .22rem; font-weight: 600; text-decoration: none; }
.recent-excerpt-ref:hover { text-decoration: underline; }
.thread-stats { margin: .36rem 0 .68rem; }
.thread-list .thread-title-cell, .archive-thread-list .thread-title-cell { min-width: 20rem; }
.thread-title-link { font-weight: 600; text-decoration: none; }
.thread-title-link:hover { text-decoration: underline; }
.thread-state { display: inline-block; border-left: 2px solid var(--accent-line); padding-left: .36rem; font-weight: 600; text-transform: uppercase; font-size: .9rem; letter-spacing: .015em; }
.state-solved { border-left-color: var(--muted); color: var(--muted); }
.state-locked { border-left-color: var(--danger); color: var(--danger); }
.thread-listing-state { color: var(--muted); font-weight: 600; }
.author-kind { font-size: .82rem; font-weight: 600; letter-spacing: .04em; color: var(--muted); }
.staff-capcode { font-size: .84rem; font-weight: 700; }
.capcode-admin { color: var(--danger); }
.capcode-site-mod, .capcode-board-manager, .capcode-board-mod { color: var(--link); }
.posts { margin: .8rem 0; }
.post { display: grid; grid-template-columns: 9.5rem minmax(0, 1fr); grid-template-rows: auto auto auto auto auto; border: 1px solid var(--line-strong); background: var(--panel); margin: .78rem 0; overflow: hidden; }
.post-human { --author-icon: url("${HUMAN_ICON_DATA}"); }
.post-agent { --author-icon: url("${AGENT_ICON_DATA}"); border-left: 3px solid var(--accent-line); }
.post-system { --author-icon: none; }
.post::before { content: ""; grid-column: 1; grid-row: 1; width: 6.2rem; height: 6.2rem; justify-self: center; margin: .8rem .55rem .35rem; background-image: var(--author-icon); background-position: center; background-repeat: no-repeat; background-size: contain; }
.post-system::before { content: "AURA"; display: grid; place-items: center; height: 4rem; color: var(--accent-line); font-weight: 700; letter-spacing: .08em; }
.post-head, .post-meta { display: contents; }
.author-kind { grid-column: 1; grid-row: 2; text-align: center; align-self: start; }
.post-author { grid-column: 1; grid-row: 3; padding: .08rem .55rem; text-align: center; font-size: .95rem; font-weight: 700; overflow-wrap: anywhere; }
.staff-capcode { grid-column: 1; grid-row: 4; padding: .04rem .55rem; text-align: center; }
.agent-provenance { grid-column: 1; grid-row: 5; align-self: start; margin: .35rem .55rem .8rem; padding: .45rem .5rem; border: 1px solid #465117; background: var(--accent); font-size: .78rem; line-height: 1.35; text-align: center; overflow-wrap: anywhere; }
.post-secondary { grid-column: 2; grid-row: 1; min-width: 0; padding: .48rem 5.2rem .45rem .68rem; border-bottom: 1px solid var(--line); background: var(--panel-soft); color: var(--muted); font-size: .9rem; overflow-wrap: anywhere; }
.post-number { grid-column: 2; grid-row: 1; align-self: center; justify-self: end; margin-right: 3.7rem; z-index: 1; font-weight: 600; text-decoration: none; }
.post-number:hover { text-decoration: underline; }
.post-actions { grid-column: 2; grid-row: 1; align-self: center; justify-self: end; padding-right: .68rem; z-index: 2; font-size: .9rem; }
.post-reply { font-weight: 600; text-decoration: none; }
.post-reply:hover { text-decoration: underline; }
.parent-link, .post-ref { font-weight: 600; text-decoration: none; }
.parent-link:hover, .post-ref:hover { text-decoration: underline; }
.post-body { grid-column: 2; grid-row: 2 / 6; min-height: 6.2rem; padding: .85rem .9rem 1rem; border-left: 1px solid var(--line); white-space: pre-wrap; overflow-wrap: anywhere; tab-size: 4; font-size: 1rem; line-height: 1.55; }
.composer { border-top: 2px solid var(--accent-line); padding-top: .68rem; }
.composer form { margin: .2rem 0 0; }
.composer input[type="text"], .composer textarea { width: 100%; max-width: 58rem; }
.composer textarea { resize: vertical; line-height: 1.5; }
.composer button[type="submit"] { border-color: var(--action-bg); background: var(--action-bg); color: var(--action-text); font-weight: 600; }
.reply-target { border: 1px solid var(--accent-line); background: var(--panel); padding: .48rem .58rem; margin-bottom: .65rem; font-size: .98rem; }
body > footer { max-width: var(--shell-width); margin: 1rem auto; padding: 0 .8rem 1rem; color: var(--muted); font-size: .95rem; }
@media (max-width: 760px) {
  html { font-size: 125%; }
  .bar { gap: .7rem; }
  .brand-mark { width: 2.66rem; height: 2.11rem; }
  .identity { margin-left: 0; width: 100%; }
  dl { grid-template-columns: 1fr; }
  dd { margin-bottom: .4rem; }
  .forum-actions { width: 100%; }
  .post { grid-template-columns: 6.6rem minmax(0, 1fr); }
  .post::before { width: 4.4rem; height: 4.4rem; margin-top: .65rem; }
  .post-author { font-size: .86rem; }
  .agent-provenance { font-size: .72rem; margin-left: .35rem; margin-right: .35rem; }
  .post-secondary { padding-right: .68rem; }
  .post-number { position: static; grid-row: 2; justify-self: start; margin: .3rem .68rem 0; }
  .post-actions { grid-row: 2; padding-top: .3rem; }
  .post-body { grid-row: 3 / 6; }
  .thread-list th:nth-child(3), .thread-list td:nth-child(3),
  .thread-list th:nth-child(5), .thread-list td:nth-child(5),
  .board-index th:nth-child(5), .board-index td:nth-child(5),
  .recent-thread-list th:nth-child(4), .recent-thread-list td:nth-child(4),
  .archive-thread-list th:nth-child(4), .archive-thread-list td:nth-child(4),
  .archive-thread-list th:nth-child(5), .archive-thread-list td:nth-child(5) { display: none; }
  .recent-thread-list .recent-thread-cell { min-width: 20rem; }
}
`;

export function htmlPage(
  title: string,
  body: string,
  options: {
    readonly status?: number;
    readonly principal?: HumanPrincipal | null;
    readonly boards?: readonly BoardNavItem[];
    readonly activeBoardSlug?: string | null;
  } = {},
): Response {
  const principal = options.principal ?? null;
  const adminLink = principal?.role === "admin" ? `<a href="/admin">Admin</a>` : "";
  const agentsLink = principal ? `<a href="/agents">Agents</a>` : "";
  const identity = principal
    ? `<span class="identity">${escapeHtml(principal.displayName ?? principal.email)} · ${escapeHtml(principal.role)}</span>`
    : "";
  const boards = principal === null ? [] : options.boards ?? [];
  const boardStrip = boards.length === 0
    ? ""
    : `<nav class="board-strip" aria-label="Boards"><div class="board-strip-inner"><div class="board-strip-track"><span class="board-strip-label">Boards</span>${boards.map((board, index) => `${index === 0 ? "" : `<span class="board-strip-sep">/</span>`}<a href="/b/${escapeHtml(board.slug)}" title="${escapeHtml(board.title)}"${options.activeBoardSlug === board.slug ? ` aria-current="page"` : ""}>/${escapeHtml(board.slug)}/</a>`).join("")}</div></div></nav>`;
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} · Aura</title>
<link rel="stylesheet" href="/aura.css">
</head>
<body>
<header><div class="bar">
<a class="brand" href="/" aria-label="Aura home">${AURA_MARK_INLINE}<span class="brand-word">Aura</span></a>
<nav aria-label="Primary"><a href="/">Boards</a><a href="/rules">Rules</a>${agentsLink}<a href="/account">Account</a>${adminLink}</nav>
${identity}
</div></header>
${boardStrip}
<main>${body}</main>
<footer>Aura private instance · human and agent content is untrusted</footer>
</body>
</html>`;
  return withSecurityHeaders(new Response(html, {
    status: options.status ?? 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  }));
}

export function cssResponse(): Response {
  return withSecurityHeaders(new Response(AURA_CSS, {
    status: 200,
    headers: { "Content-Type": "text/css; charset=utf-8", "Cache-Control": "no-cache" },
  }));
}

export function redirectResponse(location: string, status = 303): Response {
  return withSecurityHeaders(new Response(null, {
    status,
    headers: { Location: location, "Cache-Control": "no-store" },
  }));
}

export function textResponse(text: string, status: number): Response {
  return withSecurityHeaders(new Response(text, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  }));
}

export function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("Content-Security-Policy", CSP);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  headers.set("X-Frame-Options", "DENY");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
