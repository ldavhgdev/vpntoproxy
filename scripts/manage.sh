#!/bin/bash

# VPN to Proxy Manager - Management Script

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
SERVICE_NAME="vpn-to-proxy"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print functions
print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Menu
show_menu() {
    echo ""
    echo "========================================="
    echo "  VPN to Proxy Manager - Management CLI"
    echo "========================================="
    echo ""
    echo "Commands:"
    echo "  start       - Start the service"
    echo "  stop        - Stop the service"
    echo "  restart     - Restart the service"
    echo "  status      - Check service status"
    echo "  logs        - View service logs"
    echo "  config      - Edit configuration"
    echo "  install     - Install the system"
    echo "  uninstall   - Uninstall the system"
    echo "  test        - Run tests"
    echo "  backup      - Backup configuration"
    echo "  update      - Update application"
    echo "  docker-up   - Start with Docker"
    echo "  docker-down - Stop Docker containers"
    echo "  help        - Show this menu"
    echo ""
}

# Commands
cmd_start() {
    if command -v systemctl &> /dev/null; then
        print_info "Starting service..."
        sudo systemctl start $SERVICE_NAME
        print_success "Service started"
        systemctl status $SERVICE_NAME
    else
        print_error "systemctl not found. Using Node directly..."
        cd $PROJECT_DIR
        node src/index.js &
    fi
}

cmd_stop() {
    if command -v systemctl &> /dev/null; then
        print_info "Stopping service..."
        sudo systemctl stop $SERVICE_NAME
        print_success "Service stopped"
    else
        print_error "systemctl not found"
    fi
}

cmd_restart() {
    print_info "Restarting service..."
    cmd_stop
    sleep 2
    cmd_start
}

cmd_status() {
    if command -v systemctl &> /dev/null; then
        print_info "Service status:"
        systemctl status $SERVICE_NAME
    else
        print_error "systemctl not found"
    fi
}

cmd_logs() {
    if command -v journalctl &> /dev/null; then
        print_info "Showing logs (Ctrl+C to exit)..."
        journalctl -u $SERVICE_NAME -f --lines 50
    else
        print_warning "journalctl not found, checking file logs..."
        tail -f /var/log/vpn-to-proxy/app.log
    fi
}

cmd_config() {
    if [ -f /etc/vpn-to-proxy/.env ]; then
        print_info "Editing configuration..."
        sudo nano /etc/vpn-to-proxy/.env
        cmd_restart
    else
        print_error ".env file not found"
    fi
}

cmd_install() {
    print_info "Running installation script..."
    sudo bash $SCRIPT_DIR/install.sh
}

cmd_uninstall() {
    print_warning "This will uninstall the system. Continue? (y/N)"
    read -r confirm
    if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
        print_info "Uninstalling..."
        sudo systemctl stop $SERVICE_NAME || true
        sudo systemctl disable $SERVICE_NAME || true
        sudo rm /etc/systemd/system/$SERVICE_NAME.service || true
        sudo systemctl daemon-reload
        print_success "Uninstalled"
    else
        print_info "Cancelled"
    fi
}

cmd_test() {
    print_info "Running tests..."
    cd $PROJECT_DIR
    npm test || print_error "Tests failed"
}

cmd_backup() {
    BACKUP_FILE="vpn-proxy-backup-$(date +%Y%m%d-%H%M%S).tar.gz"
    print_info "Backing up configuration..."

    mkdir -p ~/backups
    sudo tar -czf ~/backups/$BACKUP_FILE \
        /etc/vpn-to-proxy/ \
        /var/log/vpn-to-proxy/ \
        2>/dev/null || true

    print_success "Backup saved: ~/backups/$BACKUP_FILE"
}

cmd_update() {
    print_info "Updating application..."
    cd $PROJECT_DIR

    print_info "Fetching latest changes..."
    git pull

    print_info "Installing dependencies..."
    npm install

    print_info "Restarting service..."
    cmd_restart

    print_success "Update completed"
}

cmd_docker_up() {
    print_info "Starting Docker containers..."
    cd $PROJECT_DIR
    docker-compose up -d
    print_success "Docker containers started"
    docker-compose ps
}

cmd_docker_down() {
    print_warning "Stopping Docker containers? (y/N)"
    read -r confirm
    if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
        print_info "Stopping Docker containers..."
        cd $PROJECT_DIR
        docker-compose down
        print_success "Docker containers stopped"
    else
        print_info "Cancelled"
    fi
}

# Main
main() {
    if [ $# -eq 0 ]; then
        show_menu
        return 0
    fi

    case "$1" in
        start)
            cmd_start
            ;;
        stop)
            cmd_stop
            ;;
        restart)
            cmd_restart
            ;;
        status)
            cmd_status
            ;;
        logs)
            cmd_logs
            ;;
        config)
            cmd_config
            ;;
        install)
            cmd_install
            ;;
        uninstall)
            cmd_uninstall
            ;;
        test)
            cmd_test
            ;;
        backup)
            cmd_backup
            ;;
        update)
            cmd_update
            ;;
        docker-up)
            cmd_docker_up
            ;;
        docker-down)
            cmd_docker_down
            ;;
        help)
            show_menu
            ;;
        *)
            print_error "Unknown command: $1"
            show_menu
            exit 1
            ;;
    esac
}

main "$@"
