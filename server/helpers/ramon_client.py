# -*- coding: utf-8 -*-
"""
ramon_client.py - Puente de Solo Lectura para Ramon (TACTIC)
Uso desde Node.js / CLI:
  python ramon_client.py ping
  python ramon_client.py login <username> <password>
  python ramon_client.py tasks <username> [project_code]
  python ramon_client.py projects
"""

import sys
import os
import json
import tempfile
import urllib.request
import urllib.error
import ssl

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

# Libreria cliente de TACTIC (embebida localmente o desde red Z:/S:)
TACTIC_PATHS = [
    SCRIPT_DIR,
    r"Z:\INTERNO\TOOLS\GITHUB\TOOLS\dev\lasp\tactic\client",
    r"S:\INTERNO\TOOLS\GITHUB\TOOLS\dev\lasp\tactic\client",
]
for tp in TACTIC_PATHS:
    if os.path.exists(tp) and tp not in sys.path:
        sys.path.insert(0, tp)

try:
    from tactic_client_lib.tactic_server_stub import TacticServerStub
except ImportError as e:
    print(json.dumps({"success": False, "error": f"No se pudo cargar la libreria de TACTIC: {e}"}))
    sys.exit(1)

CACHE_SERVER_FILE = os.path.join(tempfile.gettempdir(), "pipeta_ramon_host.txt")
_ACTIVE_SERVER = None

ADMIN_USER  = "admin"
ADMIN_PASS  = "R4mon_3s_4dmin"

# Endpoints canonicos de Ramon:
# 1) LAN local del estudio (puerto 80)
# 2) WAN remoto para artistas externos sin VPN (HTTPS puerto 8075)
# 3) Fallbacks adicionales
DEFAULT_SERVERS = [
    "http://192.168.206.140",
    "https://ramon.lasp.co:8075",
    "https://ramon.lasp.co",
    "http://ramon.lasp.co"
]


def probe_server(url, timeout=1.5):
    """Prueba de forma ultra rapida si un servidor responde HTTP/HTTPS."""
    if not url:
        return False
    try:
        target = url if url.endswith('/') else (url + '/')
        ctx = ssl._create_unverified_context()
        req = urllib.request.Request(target, headers={'User-Agent': 'Pipeta/RamonProbe'})
        with urllib.request.urlopen(req, timeout=timeout, context=ctx) as r:
            return r.getcode() < 500
    except urllib.error.HTTPError:
        # Codigos 401, 403, 404, etc. indican que el servidor esta vivo y responde
        return True
    except Exception:
        return False


def get_active_server(force_refresh=False):
    """Obtiene o descubre el servidor de Ramon activo (red LAN o remoto WAN)."""
    global _ACTIVE_SERVER
    if not force_refresh and _ACTIVE_SERVER:
        return _ACTIVE_SERVER

    # 1. Probar servidor cacheado en disco si existe (latencia minima en llamadas repetidas)
    if not force_refresh and os.path.exists(CACHE_SERVER_FILE):
        try:
            with open(CACHE_SERVER_FILE, "r", encoding="utf-8") as f:
                cached = f.read().strip()
            if cached and probe_server(cached, timeout=1.2):
                _ACTIVE_SERVER = cached
                return _ACTIVE_SERVER
        except Exception:
            pass

    # 2. Construir lista de candidatos (incluyendo variable de entorno si existe)
    candidates = []
    env_server = os.environ.get("TACTIC_SERVER")
    if env_server and env_server.strip():
        candidates.append(env_server.strip())
    for s in DEFAULT_SERVERS:
        if s not in candidates:
            candidates.append(s)

    # 3. Probar candidatos en orden de prioridad con timeout corto
    for cand in candidates:
        if probe_server(cand, timeout=1.5):
            _ACTIVE_SERVER = cand
            try:
                with open(CACHE_SERVER_FILE, "w", encoding="utf-8") as f:
                    f.write(cand)
            except Exception:
                pass
            return _ACTIVE_SERVER

    # 4. Fallback al primer servidor predeterminado si ninguno responde al probe
    fallback = DEFAULT_SERVERS[0]
    _ACTIVE_SERVER = fallback
    return fallback


def invalidate_cached_server():
    """Invalida la cache si la conexion falla durante la ejecucion."""
    global _ACTIVE_SERVER
    _ACTIVE_SERVER = None
    try:
        if os.path.exists(CACHE_SERVER_FILE):
            os.remove(CACHE_SERVER_FILE)
    except Exception:
        pass


def make_stub(host=None, user=None, password=None, project="sthpw"):
    """Crea un stub conectado directamente (setup=False) a un host Ramon."""
    target_host = (host or get_active_server()).rstrip('/')
    u = user or ADMIN_USER
    p = password or ADMIN_PASS
    stub = TacticServerStub(
        server=target_host,
        user=u,
        password=p,
        project=project,
        setup=False
    )
    return stub, target_host


def get_admin_stub():
    """Retorna (stub, host) admin conectado al servidor Ramon activo."""
    host = get_active_server()
    try:
        stub, clean_host = make_stub(host)
        return stub, clean_host
    except Exception as e:
        invalidate_cached_server()
        fresh_host = get_active_server(force_refresh=True)
        stub, clean_host = make_stub(fresh_host)
        return stub, clean_host


def get_user_display_name(admin_stub, login):
    """Devuelve el nombre completo del usuario dado su login, o None."""
    try:
        users = admin_stub.query("sthpw/login", filters=[("login", login)])
        if users:
            # Usar display_name del registro primero (mas fiable que first+last)
            dn = users[0].get("display_name") or ""
            if dn.strip():
                return dn.strip()
            # Fallback: construir con first_name + last_name
            fn = users[0].get("first_name") or ""
            ln = users[0].get("last_name") or ""
            full = f"{fn} {ln}".strip()
            return full or None
    except Exception:
        pass
    return None


def do_ping():
    try:
        stub, host = get_admin_stub()
        print(json.dumps({"success": True, "host": host, "message": "Conexion exitosa con Ramon"}))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))


def do_login(username, password):
    if not username or not password:
        print(json.dumps({"success": False, "error": "Debe especificar usuario y contrasena"}))
        return

    try:
        server = get_active_server()
    except Exception as e:
        print(json.dumps({"success": False, "error": f"No se pudo conectar a Ramon: {e}"}))
        return

    auth_host = None
    last_err = None

    try:
        stub, auth_host = make_stub(server, user=username, password=password)
        stub.query("sthpw/login", filters=[("login", username)], limit=1)
    except Exception as e:
        err = str(e)
        if any(k in err for k in ["nvalid", "ncorrect", "denied", "401"]):
            print(json.dumps({"success": False, "error": "Usuario o contrasena de dominio incorrectos"}))
            return
        last_err = e
        # Si fallo el host actual, reintentar forzando redescubrimiento
        try:
            invalidate_cached_server()
            server = get_active_server(force_refresh=True)
            stub, auth_host = make_stub(server, user=username, password=password)
            stub.query("sthpw/login", filters=[("login", username)], limit=1)
        except Exception as retry_err:
            retry_str = str(retry_err)
            if any(k in retry_str for k in ["nvalid", "ncorrect", "denied", "401"]):
                print(json.dumps({"success": False, "error": "Usuario o contrasena de dominio incorrectos"}))
                return
            last_err = retry_err
            auth_host = None

    if not auth_host:
        print(json.dumps({"success": False, "error": f"Error de autenticacion con Ramon: {last_err}"}))
        return

    try:
        admin_stub, _ = make_stub(auth_host)
        users = admin_stub.query("sthpw/login", filters=[("login", username)])
        user_info = users[0] if users else {}
        fn = user_info.get("first_name") or ""
        ln = user_info.get("last_name") or ""
        full_name = f"{fn} {ln}".strip() or username

        print(json.dumps({
            "success": True,
            "user": {
                "login": username,
                "first_name": fn,
                "last_name": ln,
                "display_name": full_name,
                "email": user_info.get("email") or ""
            },
            "server": auth_host
        }))
    except Exception as e:
        print(json.dumps({
            "success": True,
            "user": {"login": username, "first_name": "", "last_name": "", "display_name": username, "email": ""},
            "server": auth_host,
            "warning": str(e)
        }))


def do_tasks(target_user, project_filter=None):
    if not target_user:
        print(json.dumps({"success": False, "error": "Debe especificar un usuario"}))
        return

    try:
        admin_stub, _ = get_admin_stub()

        display_name = get_user_display_name(admin_stub, target_user)

        # Buscar por login
        tasks_by_login = admin_stub.query("sthpw/task", filters=[("assigned", target_user)])

        # Buscar por nombre completo si es distinto
        tasks_by_name = []
        if display_name and display_name.lower() != target_user.lower():
            tasks_by_name = admin_stub.query("sthpw/task", filters=[("assigned", display_name)])

        # Unir y deduplicar por id
        seen_ids = set()
        all_tasks = []
        for t in tasks_by_login + tasks_by_name:
            tid = t.get("id") or t.get("code") or id(t)
            if tid not in seen_ids:
                seen_ids.add(tid)
                all_tasks.append(t)

        if project_filter:
            pf = project_filter.lower()
            all_tasks = [t for t in all_tasks if (t.get("project_code") or "").lower() == pf]

        # Agrupar códigos por proyecto para batch query en 1 sola llamada
        shots_by_proj = {}
        assets_by_proj = {}
        for t in all_tasks:
            proj  = t.get("project_code") or ""
            stype = t.get("search_type") or ""
            scode = t.get("search_code") or ""
            if not proj or not scode:
                continue
            if "planos" in stype:
                shots_by_proj.setdefault(proj, set()).add(scode)
            elif "asset" in stype:
                assets_by_proj.setdefault(proj, set()).add(scode)

        shot_cache  = {}
        for proj, codes in shots_by_proj.items():
            try:
                s_list = admin_stub.query(f"LaSP/planos?project={proj}", filters=[("code", "in", list(codes))])
                for s in s_list:
                    c = s.get("code")
                    if c:
                        shot_cache[f"{proj}::{c}"] = s
            except Exception:
                pass

        asset_cache = {}
        for proj, codes in assets_by_proj.items():
            try:
                a_list = admin_stub.query(f"LaSP/asset?project={proj}", filters=[("code", "in", list(codes))])
                for a in a_list:
                    c = a.get("code")
                    if c:
                        asset_cache[f"{proj}::{c}"] = a
            except Exception:
                pass

        results = []

        for t in all_tasks:
            proj   = t.get("project_code") or ""
            stype  = t.get("search_type") or ""
            scode  = t.get("search_code") or ""
            proc   = t.get("process") or ""
            status = t.get("status") or "PENDIENTE"
            desc   = t.get("description") or ""
            bid_start  = t.get("bid_start_date") or ""
            bid_end    = t.get("bid_end_date") or ""
            bid_dur    = t.get("bid_duration")
            supervisor = t.get("supervisor") or ""
            task_id    = t.get("id")

            name_resolved = scode
            item_type  = "Otro"
            frame_in   = None
            frame_out  = None

            if "planos" in stype and proj and scode:
                item_type = "Plano"
                cache_key = f"{proj}::{scode}"
                cached = shot_cache.get(cache_key)
                if not cached:
                    # Fallback individual si no vino en el batch
                    try:
                        s_data = admin_stub.query(f"LaSP/planos?project={proj}", filters=[("code", scode)])
                        cached = s_data[0] if s_data else None
                        shot_cache[cache_key] = cached
                    except Exception:
                        pass
                if cached:
                    name_resolved = cached.get("name") or scode
                    frame_in  = cached.get("frame_in")
                    frame_out = cached.get("frame_out")

            elif "asset" in stype and proj and scode:
                item_type = "Asset"
                cache_key = f"{proj}::{scode}"
                cached = asset_cache.get(cache_key)
                if not cached:
                    try:
                        a_data = admin_stub.query(f"LaSP/asset?project={proj}", filters=[("code", scode)])
                        cached = a_data[0] if a_data else None
                        asset_cache[cache_key] = cached
                    except Exception:
                        pass
                if cached:
                    name_resolved = cached.get("name") or scode

            results.append({
                "id": task_id, "project": proj, "search_code": scode,
                "name": name_resolved, "item_type": item_type,
                "process": proc, "status": status, "description": desc,
                "frame_in": frame_in, "frame_out": frame_out,
                "bid_duration": bid_dur, "bid_start": bid_start,
                "bid_end": bid_end, "supervisor": supervisor,
                "assigned": t.get("assigned")
            })

        print(json.dumps({"success": True, "tasks": results, "count": len(results)}, ensure_ascii=False))

    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))


def do_project_tasks(project_code):
    if not project_code:
        print(json.dumps({"success": False, "error": "Debe especificar un proyecto"}))
        return

    try:
        admin_stub, _ = get_admin_stub()
        p_code = project_code.lower().strip()

        # 1. Consultar planos del proyecto para obtener nombres canónicos y metadatos
        shots_raw = []
        try:
            shots_raw = admin_stub.query(f"LaSP/planos?project={p_code}")
        except Exception:
            shots_raw = []

        shots_by_code = {}
        all_shots_list = []
        for s in shots_raw:
            c = s.get("code")
            if c:
                shots_by_code[c] = s
                all_shots_list.append({
                    "code": c,
                    "name": s.get("name") or c,
                    "frame_in": s.get("frame_in"),
                    "frame_out": s.get("frame_out"),
                    "description": s.get("description") or ""
                })

        # 2. Consultar todas las tareas del proyecto
        tasks_raw = admin_stub.query("sthpw/task", filters=[("project_code", p_code)])

        results = []
        for t in tasks_raw:
            stype  = t.get("search_type") or ""
            scode  = t.get("search_code") or ""
            proc   = t.get("process") or ""
            status = t.get("status") or "PENDIENTE"
            desc   = t.get("description") or ""
            bid_start  = t.get("bid_start_date") or ""
            bid_end    = t.get("bid_end_date") or ""
            bid_dur    = t.get("bid_duration")
            supervisor = t.get("supervisor") or ""
            task_id    = t.get("id")
            assigned   = t.get("assigned") or ""

            name_resolved = scode
            item_type = "Plano" if "planos" in stype else ("Asset" if "asset" in stype else "Otro")
            frame_in = None
            frame_out = None

            if scode in shots_by_code:
                s_info = shots_by_code[scode]
                name_resolved = s_info.get("name") or scode
                frame_in  = s_info.get("frame_in")
                frame_out = s_info.get("frame_out")

            results.append({
                "id": task_id,
                "project": p_code,
                "search_code": scode,
                "name": name_resolved,
                "item_type": item_type,
                "process": proc,
                "status": status,
                "description": desc,
                "frame_in": frame_in,
                "frame_out": frame_out,
                "bid_duration": bid_dur,
                "bid_start": bid_start,
                "bid_end": bid_end,
                "supervisor": supervisor,
                "assigned": assigned
            })

        print(json.dumps({
            "success": True,
            "project": p_code,
            "tasks": results,
            "shots": all_shots_list,
            "count": len(results)
        }, ensure_ascii=False))

    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))


def do_projects():
    try:
        admin_stub, _ = get_admin_stub()
        raw = admin_stub.query("sthpw/project")
        projects = []
        for p in raw:
            code = p.get("code")
            if code and code not in ["admin", "sthpw"]:
                projects.append({"code": code, "title": p.get("title") or code})
        projects.sort(key=lambda x: x["title"].lower())
        print(json.dumps({"success": True, "projects": projects}))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))


def do_users():
    try:
        admin_stub, _ = get_admin_stub()
        raw = admin_stub.query("sthpw/login", order_bys=["login"])
        users = []
        for u in raw:
            login = u.get("login") or ""
            if not login or login == "admin":
                continue
            first_name = u.get("first_name") or ""
            last_name = u.get("last_name") or ""
            display_name = u.get("display_name") or f"{first_name} {last_name}".strip()
            email = u.get("email") or ""
            users.append({
                "login": login,
                "first_name": first_name,
                "last_name": last_name,
                "display_name": display_name,
                "email": email
            })
        users.sort(key=lambda x: (x["display_name"] or x["login"]).lower())
        print(json.dumps({"success": True, "users": users}))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "error": "Comando requerido: ping, login, tasks, project_tasks, projects, users"}))
        sys.exit(1)

    cmd = sys.argv[1].lower()
    if cmd == "ping":
        do_ping()
    elif cmd == "login":
        u = sys.argv[2] if len(sys.argv) > 2 else ""
        p = sys.argv[3] if len(sys.argv) > 3 else ""
        do_login(u, p)
    elif cmd == "tasks":
        u    = sys.argv[2] if len(sys.argv) > 2 else ""
        proj = sys.argv[3] if len(sys.argv) > 3 else None
        do_tasks(u, proj)
    elif cmd == "project_tasks":
        proj = sys.argv[2] if len(sys.argv) > 2 else ""
        do_project_tasks(proj)
    elif cmd == "projects":
        do_projects()
    elif cmd == "users":
        do_users()
    else:
        print(json.dumps({"success": False, "error": f"Comando desconocido: {cmd}"}))
