#!/usr/bin/env bash

# =============================================================================
# Docker Compose Auto-Start Setup Script
# =============================================================================
# This script configures the inbox-zero Docker Compose stack to start automatically
# on boot using the most appropriate method available on the system.
#
# Priority order:
# 1. Docker Compose restart policies (preferred - no external dependencies)
# 2. Cron @reboot (fallback if Docker restart policies aren't sufficient)
# 3. systemd service (last resort)
# =============================================================================

# Exit immediately if:
# - Any command exits with a non-zero status (-e)
# - Any undefined variable is used (-u) 
# - Any command in a pipeline fails (-o pipefail)
set -euo pipefail

# =============================================================================
# GLOBAL VARIABLES AND CONFIGURATION
# =============================================================================

# Get the absolute path of the current directory (where docker-compose.yml lives)
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.yml"
readonly ENV_FILE="${SCRIPT_DIR}/apps/web/.env"
readonly RUN_SCRIPT="${SCRIPT_DIR}/run-docker.sh"

# Service name for systemd (if needed)
readonly SERVICE_NAME="inbox-zero-docker"

# Log file for debugging startup issues
readonly LOG_FILE="${SCRIPT_DIR}/autostart.log"

# =============================================================================
# CLEANUP AND ERROR HANDLING
# =============================================================================

# Function to perform cleanup operations on script exit
cleanup() {
    local exit_code=$?
    
    # Log the exit status for debugging
    if [[ $exit_code -ne 0 ]]; then
        echo "Script exited with error code: $exit_code" | tee -a "${LOG_FILE}"
    fi
    
    # Remove any temporary files created during execution
    # (None created in this script, but keeping for future extensibility)
    
    echo "Cleanup completed at $(date)" >> "${LOG_FILE}"
}

# Set up trap to call cleanup function on EXIT signal
# This ensures cleanup runs whether script exits normally or due to error
trap cleanup EXIT

# =============================================================================
# UTILITY FUNCTIONS
# =============================================================================

# Function to log messages with timestamps
log_message() {
    local message="$1"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$timestamp] $message" | tee -a "${LOG_FILE}"
}

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to check if Docker daemon is running
check_docker_daemon() {
    if ! docker info >/dev/null 2>&1; then
        log_message "ERROR: Docker daemon is not running. Please start Docker first."
        return 1
    fi
    return 0
}

# Function to validate required files exist
validate_environment() {
    log_message "Validating environment..."
    
    # Check if docker-compose.yml exists
    if [[ ! -f "$COMPOSE_FILE" ]]; then
        log_message "ERROR: docker-compose.yml not found at $COMPOSE_FILE"
        return 1
    fi
    
    # Check if .env file exists
    if [[ ! -f "$ENV_FILE" ]]; then
        log_message "ERROR: .env file not found at $ENV_FILE"
        return 1
    fi
    
    # Check if run-docker.sh exists and is executable
    if [[ ! -f "$RUN_SCRIPT" ]]; then
        log_message "ERROR: run-docker.sh not found at $RUN_SCRIPT"
        return 1
    fi
    
    if [[ ! -x "$RUN_SCRIPT" ]]; then
        log_message "Making run-docker.sh executable..."
        chmod +x "$RUN_SCRIPT"
    fi
    
    # Verify Docker and Docker Compose are available
    if ! command_exists docker; then
        log_message "ERROR: Docker is not installed"
        return 1
    fi
    
    if ! command_exists docker-compose && ! docker compose version >/dev/null 2>&1; then
        log_message "ERROR: Docker Compose is not available"
        return 1
    fi
    
    log_message "Environment validation completed successfully"
    return 0
}

# =============================================================================
# DOCKER COMPOSE RESTART POLICY SETUP (PREFERRED METHOD)
# =============================================================================

# Function to update Docker Compose file with proper restart policies
setup_docker_restart_policies() {
    log_message "Setting up Docker restart policies..."
    
    # Create a backup of the original docker-compose.yml
    if [[ ! -f "${COMPOSE_FILE}.backup" ]]; then
        log_message "Creating backup of docker-compose.yml..."
        cp "$COMPOSE_FILE" "${COMPOSE_FILE}.backup"
    fi
    
    # Check if restart policies are already configured
    if grep -q "restart: unless-stopped" "$COMPOSE_FILE" || grep -q "restart: always" "$COMPOSE_FILE"; then
        log_message "Docker restart policies already configured"
        return 0
    fi
    
    log_message "Adding restart: unless-stopped to all services..."
    
    # Use a temporary file for safe modification
    local temp_file="${COMPOSE_FILE}.tmp"
    
    # Add restart policy to services that don't have one
    # This is a bit complex but ensures we don't duplicate existing restart policies
    awk '
    /^services:/ { in_services = 1 }
    /^[a-zA-Z]/ && !/^services:/ && !/^  / { in_services = 0 }
    /^  [a-zA-Z]/ && in_services { 
        in_service = 1
        service_line = $0
        has_restart = 0
    }
    /^    restart:/ && in_service { has_restart = 1 }
    /^  [a-zA-Z]/ && in_service && NR > 1 && prev_in_service {
        if (!prev_has_restart && prev_service_line != "") {
            print prev_service_line
            print "    restart: unless-stopped"
        }
        prev_service_line = service_line
        prev_has_restart = has_restart
        prev_in_service = in_service
        has_restart = 0
    }
    /^[^  ]/ && !in_services && prev_in_service {
        if (!prev_has_restart && prev_service_line != "") {
            print prev_service_line
            print "    restart: unless-stopped"
        }
        prev_in_service = 0
    }
    END {
        if (prev_in_service && !prev_has_restart && prev_service_line != "") {
            print prev_service_line
            print "    restart: unless-stopped"
        }
    }
    { 
        if (!in_service || has_restart || (in_service && !/^  [a-zA-Z]/)) {
            print $0
        }
        prev_in_service = in_service
        if (!/^  [a-zA-Z]/) in_service = 0
    }
    ' "$COMPOSE_FILE" > "$temp_file"
    
    # Replace original with modified version if it's valid
    if docker-compose -f "$temp_file" config >/dev/null 2>&1; then
        mv "$temp_file" "$COMPOSE_FILE"
        log_message "Successfully updated Docker Compose file with restart policies"
    else
        log_message "WARNING: Generated docker-compose.yml is invalid, keeping original"
        rm -f "$temp_file"
        return 1
    fi
    
    return 0
}

# =============================================================================
# CRON-BASED AUTOSTART SETUP (FALLBACK METHOD)
# =============================================================================

# Function to set up cron-based autostart
setup_cron_autostart() {
    log_message "Setting up cron-based autostart..."
    
    # Create a startup script that will be called by cron
    local startup_script="${SCRIPT_DIR}/autostart-cron.sh"
    
    cat > "$startup_script" << 'STARTUP_EOF'
#!/usr/bin/env bash

# Autostart script for inbox-zero Docker Compose stack
# This script is called by cron on system boot

# Same error handling as main script
set -euo pipefail

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="${SCRIPT_DIR}/autostart.log"

# Function to log with timestamp
log_message() {
    local message="$1"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$timestamp] CRON: $message" >> "${LOG_FILE}"
}

# Wait for Docker daemon to be ready (up to 60 seconds)
wait_for_docker() {
    local max_attempts=12
    local attempt=1
    
    log_message "Waiting for Docker daemon to be ready..."
    
    while [[ $attempt -le $max_attempts ]]; do
        if docker info >/dev/null 2>&1; then
            log_message "Docker daemon is ready"
            return 0
        fi
        
        log_message "Docker not ready, attempt $attempt/$max_attempts"
        sleep 5
        ((attempt++))
    done
    
    log_message "ERROR: Docker daemon failed to start within timeout"
    return 1
}

# Main execution
main() {
    log_message "Cron autostart triggered"
    
    # Wait for Docker to be ready
    if ! wait_for_docker; then
        exit 1
    fi
    
    # Change to the project directory
    cd "$SCRIPT_DIR"
    
    # Run the existing startup script
    if [[ -x "./run-docker.sh" ]]; then
        log_message "Executing run-docker.sh..."
        ./run-docker.sh >> "${LOG_FILE}" 2>&1
        log_message "Docker Compose stack started successfully via cron"
    else
        log_message "ERROR: run-docker.sh not found or not executable"
        exit 1
    fi
}

# Execute main function
main "$@"
STARTUP_EOF

    # Make the startup script executable
    chmod +x "$startup_script"
    
    # Add cron job if it doesn't already exist
    local cron_line="@reboot $startup_script"
    
    # Check if cron job already exists
    if crontab -l 2>/dev/null | grep -F "$startup_script" >/dev/null; then
        log_message "Cron job already exists"  
        return 0
    fi
    
    # Add the cron job
    (crontab -l 2>/dev/null || true; echo "$cron_line") | crontab -
    log_message "Added cron job: $cron_line"
    
    return 0
}

# =============================================================================
# SYSTEMD SERVICE SETUP (LAST RESORT)
# =============================================================================

# Function to create systemd service
setup_systemd_service() {
    log_message "Setting up systemd service..."
    
    # Check if systemd is available
    if ! command_exists systemctl; then
        log_message "ERROR: systemctl not available, cannot create systemd service"
        return 1
    fi
    
    # Create systemd service file
    local service_file="/etc/systemd/system/${SERVICE_NAME}.service"
    
    log_message "Creating systemd service file at $service_file"
    
    # Create the service file (requires sudo)
    sudo tee "$service_file" > /dev/null << SERVICE_EOF
[Unit]
Description=Inbox Zero Docker Compose Stack
Requires=docker.service
After=docker.service
StartLimitIntervalSec=0

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=${SCRIPT_DIR}
ExecStart=${RUN_SCRIPT}
ExecStop=/usr/bin/docker-compose -f ${COMPOSE_FILE} down
TimeoutStartSec=0
Restart=on-failure
RestartSec=5s
User=${USER}
Group=${USER}

# Environment variables
Environment=HOME=${HOME}
Environment=USER=${USER}

# Logging
StandardOutput=append:${LOG_FILE}
StandardError=append:${LOG_FILE}

[Install]
WantedBy=multi-user.target
SERVICE_EOF

    # Reload systemd and enable the service
    log_message "Reloading systemd daemon..."
    sudo systemctl daemon-reload
    
    log_message "Enabling service to start on boot..."
    sudo systemctl enable "$SERVICE_NAME"
    
    log_message "Systemd service created and enabled successfully"
    
    return 0
}

# =============================================================================
# MAIN EXECUTION LOGIC
# =============================================================================

# Function to display usage information
show_usage() {
    cat << 'USAGE_EOF'
Usage: ./setup-autostart.sh [OPTIONS]

This script configures the inbox-zero Docker Compose stack to start automatically on boot.

OPTIONS:
    -h, --help          Show this help message
    -m, --method METHOD Specify the autostart method to use
                        Values: docker, cron, systemd, auto (default)
    -t, --test          Test the current configuration without making changes
    -r, --remove        Remove autostart configuration

METHODS:
    docker    Use Docker restart policies (preferred)
    cron      Use cron @reboot job
    systemd   Use systemd service
    auto      Automatically choose the best available method (default)

EXAMPLES:
    ./setup-autostart.sh                    # Auto-configure using best method
    ./setup-autostart.sh -m docker         # Force use of Docker restart policies
    ./setup-autostart.sh -t                # Test current configuration
    ./setup-autostart.sh -r                # Remove autostart configuration

USAGE_EOF
}

# Function to test current autostart configuration
test_configuration() {
    log_message "Testing current autostart configuration..."
    
    local methods_found=0
    
    # Check Docker restart policies
    if grep -q "restart: unless-stopped\|restart: always" "$COMPOSE_FILE"; then
        log_message "✓ Docker restart policies are configured"
        ((methods_found++))
    fi
    
    # Check cron jobs
    if crontab -l 2>/dev/null | grep -q "autostart-cron.sh"; then
        log_message "✓ Cron-based autostart is configured"
        ((methods_found++))
    fi
    
    # Check systemd service
    if systemctl is-enabled "$SERVICE_NAME" >/dev/null 2>&1; then
        log_message "✓ Systemd service is configured and enabled"
        ((methods_found++))
    fi
    
    if [[ $methods_found -eq 0 ]]; then
        log_message "❌ No autostart configuration found"
        return 1
    elif [[ $methods_found -gt 1 ]]; then
        log_message "⚠️  Multiple autostart methods configured (may cause issues)"
    fi
    
    log_message "Configuration test completed"
    return 0
}

# Function to remove autostart configuration
remove_configuration() {
    log_message "Removing autostart configuration..."
    
    local removed_any=false
    
    # Remove cron job
    if crontab -l 2>/dev/null | grep -q "autostart-cron.sh"; then
        log_message "Removing cron job..."
        crontab -l 2>/dev/null | grep -v "autostart-cron.sh" | crontab -
        removed_any=true
    fi
    
    # Remove systemd service
    if systemctl is-enabled "$SERVICE_NAME" >/dev/null 2>&1; then
        log_message "Disabling and removing systemd service..."
        sudo systemctl disable "$SERVICE_NAME"
        sudo rm -f "/etc/systemd/system/${SERVICE_NAME}.service"
        sudo systemctl daemon-reload
        removed_any=true
    fi
    
    # Restore original docker-compose.yml if backup exists
    if [[ -f "${COMPOSE_FILE}.backup" ]]; then
        log_message "Restoring original docker-compose.yml..."
        cp "${COMPOSE_FILE}.backup" "$COMPOSE_FILE"
        removed_any=true
    fi
    
    # Remove generated scripts
    local autostart_script="${SCRIPT_DIR}/autostart-cron.sh"
    if [[ -f "$autostart_script" ]]; then
        log_message "Removing generated autostart script..."
        rm -f "$autostart_script"
        removed_any=true
    fi
    
    if [[ "$removed_any" == true ]]; then
        log_message "Autostart configuration removed successfully"
    else
        log_message "No autostart configuration found to remove"
    fi
    
    return 0
}

# Main function that orchestrates the setup process
main() {
    local method="auto"
    local test_only=false
    local remove_config=false
    
    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                show_usage
                exit 0
                ;;
            -m|--method)
                method="$2"
                shift 2
                ;;
            -t|--test)
                test_only=true
                shift
                ;;
            -r|--remove)
                remove_config=true
                shift
                ;;
            *)
                log_message "ERROR: Unknown option $1"
                show_usage
                exit 1
                ;;
        esac
    done
    
    # Validate method parameter
    if [[ ! "$method" =~ ^(auto|docker|cron|systemd)$ ]]; then
        log_message "ERROR: Invalid method '$method'. Must be one of: auto, docker, cron, systemd"
        exit 1
    fi
    
    log_message "Starting autostart setup script..."
    log_message "Working directory: $SCRIPT_DIR"
    log_message "Method: $method"
    
    # Handle special modes
    if [[ "$remove_config" == true ]]; then
        remove_configuration
        exit 0
    fi
    
    if [[ "$test_only" == true ]]; then
        test_configuration
        exit $?
    fi
    
    # Validate environment before proceeding
    if ! validate_environment; then
        log_message "Environment validation failed, exiting"
        exit 1
    fi
    
    # Check Docker daemon
    if ! check_docker_daemon; then
        exit 1
    fi
    
    # Execute the appropriate setup method
    case $method in
        docker)
            setup_docker_restart_policies
            ;;
        cron)
            setup_cron_autostart
            ;;
        systemd)
            setup_systemd_service
            ;;
        auto)
            # Try methods in order of preference
            log_message "Auto-selecting best available method..."
            
            if setup_docker_restart_policies; then
                log_message "Successfully configured Docker restart policies"
            elif setup_cron_autostart; then
                log_message "Successfully configured cron-based autostart"  
            elif setup_systemd_service; then
                log_message "Successfully configured systemd service"
            else
                log_message "ERROR: All autostart methods failed"
                exit 1
            fi
            ;;
    esac
    
    log_message "Autostart setup completed successfully!"
    log_message "Your inbox-zero Docker Compose stack will now start automatically on boot."
    log_message ""
    log_message "To test the configuration, run: $0 --test"
    log_message "To remove the configuration, run: $0 --remove"
    
    return 0
}

# Execute main function with all command line arguments
main "$@"
