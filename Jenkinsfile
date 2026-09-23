import groovy.json.JsonSlurperClassic

// Posts a message to the Google Chat space configured via the
// 'google-chat-webhook' Secret text credential. Never fails the build if
// the webhook itself is down/misconfigured -- notification failures
// shouldn't take down an otherwise-successful pipeline.
def notifyGoogleChat(String message) {
    withCredentials([string(credentialsId: 'google-chat-webhook', variable: 'CHAT_WEBHOOK')]) {
        sh """
            echo "Posting to Google Chat..."
            curl -s -w '\\nHTTP status: %{http_code}\\n' -X POST -H 'Content-Type: application/json; charset=UTF-8' \
              -d '{"text": "${message}"}' \
              "\$CHAT_WEBHOOK" || true
        """
    }
}

def stageDurations = [:]
def instanceDetails = [:]
def timedStage(String name, Closure body) {
    def started = System.nanoTime()
    try {
        body()
    } finally {
        stageDurations[name] = String.format('%.1fs', (System.nanoTime() - started) / 1_000_000_000.0)
    }
}

pipeline {
    agent any

    parameters {
        choice(
            name: 'INFRA_ACTION',
            choices: ['BUILD', 'DESTROY'],
            description: 'BUILD provisions/updates the demo EC2 instance and deploys the application. DESTROY removes the Terraform-managed demo EC2 instance and skips deployment.'
        )
        string(
            name: 'SERVER_NUMBER',
            defaultValue: '1',
            trim: true,
            description: 'Stable server number used for the generated key pair and PEM filename.'
        )
    }

    environment {
        REGISTRY        = 'docker.io/gurlx'
        IMAGE_TAG       = "${env.BUILD_NUMBER}"
        SERVICES        = 'frontend api-gateway user-service product-service order-service cart-service inventory-service payment-service notification-service review-service auth-service shipping-service search-service analytics-service'
        DEPLOY_HOST     = '184.193.151.24'
        DEPLOY_USER     = 'ubuntu'
        DEPLOY_PATH     = '/var/www/html/microservices-devops.app/devops-microservices-demo'
        DOMAIN            = 'learning.run.place'
        LETSENCRYPT_EMAIL = 'gurpiyar656@gmail.com'
    }

    options {
        disableConcurrentBuilds()
        timestamps()
    }

    stages {

        stage('Checkout') {
            steps {
                script {
                    timedStage('Checkout') {
                        checkout scm
                    }
                }
            }
        }

        stage('SonarQube Analysis') {
            when { expression { params.INFRA_ACTION == 'BUILD' } }
            steps {
                script {
                    timedStage('SonarQube Analysis') {
                        def scannerHome = tool 'SonarScanner'
                        withSonarQubeEnv('SonarQube') {
                            withEnv(["SONAR_SCANNER_OPTS=-Xmx1024m"]) {
                                sh """
                                    ${scannerHome}/bin/sonar-scanner \
                                      -Dsonar.projectKey=devops-microservices-demo \
                                      -Dsonar.projectName='DevOps Microservices Demo' \
                                      -Dsonar.projectVersion=${IMAGE_TAG} \
                                      -Dsonar.sources=services \
                                      -Dsonar.exclusions=**/node_modules/**
                                """
                            }
                        }
                    }
                }
            }
        }

        stage('Quality Gate') {
            when { expression { params.INFRA_ACTION == 'BUILD' } }
            steps {
                script {
                    timedStage('Quality Gate') {
                        timeout(time: 5, unit: 'MINUTES') {
                            waitForQualityGate abortPipeline: true
                        }
                    }
                }
            }
        }

        stage('Build images') {
            when { expression { params.INFRA_ACTION == 'BUILD' } }
            steps {
                script {
                    timedStage('Build images') {
                        SERVICES.split(' ').each { svc ->
                            sh "docker build -t ${REGISTRY}/${svc}:${IMAGE_TAG} -t ${REGISTRY}/${svc}:latest ./services/${svc}"
                        }
                    }
                }
            }
        }

        stage('Push images') {
            when { expression { params.INFRA_ACTION == 'BUILD' } }
            steps {
                script {
                    timedStage('Push images') {
                        withCredentials([usernamePassword(
                            credentialsId: 'dockerhub-credentials',
                            usernameVariable: 'DOCKER_USER',
                            passwordVariable: 'DOCKER_PASS'
                        )]) {
                            sh 'echo "$DOCKER_PASS" | docker login -u "$DOCKER_USER" --password-stdin'
                            SERVICES.split(' ').each { svc ->
                                sh "docker push ${REGISTRY}/${svc}:${IMAGE_TAG}"
                                sh "docker push ${REGISTRY}/${svc}:latest"
                            }
                        }
                    }
                }
            }
        }

        stage('Deploy to server') {
            when { expression { params.INFRA_ACTION == 'BUILD' } }
            steps {
                script {
                    timedStage('Deploy to server') {
                        sshagent(credentials: ['deploy-server-ssh-key']) {
                            sh """
                                ssh -o StrictHostKeyChecking=no ${DEPLOY_USER}@${DEPLOY_HOST} 'mkdir -p ${DEPLOY_PATH}'
                                scp -o StrictHostKeyChecking=no docker-compose.prod.yml ${DEPLOY_USER}@${DEPLOY_HOST}:${DEPLOY_PATH}/docker-compose.yml
                                ssh -o StrictHostKeyChecking=no ${DEPLOY_USER}@${DEPLOY_HOST} '\
                                    cd ${DEPLOY_PATH} && \
                                    export REGISTRY=${REGISTRY} && \
                                    export IMAGE_TAG=${IMAGE_TAG} && \
                                    export DOMAIN=${DOMAIN} && \
                                    export LETSENCRYPT_EMAIL=${LETSENCRYPT_EMAIL} && \
                                    docker compose pull && \
                                    docker compose up -d --remove-orphans && \
                                    docker image prune -f \
                                '
                            """
                        }
                    }
                }
            }
        }
        }

        // Demo only: on a successful build, provision exactly one EC2
        // instance via Terraform. Not an auto-scaler -- proves Jenkins can
        // drive infrastructure-as-code. Placed last so it only runs once
        // everything before it (build/push/deploy) has already succeeded.
        //
        // Docker-outside-of-Docker gotcha: `docker run` here talks to the
        // HOST's docker daemon (via the mounted socket), so -v sources must
        // be paths that exist on the HOST, not inside this Jenkins
        // container. jenkins_home is a named volume, not literally a host
        // folder at /var/jenkins_home -- so we mount the volume BY NAME
        // (which Docker resolves correctly regardless of container) rather
        // than reusing the in-container path string, which would silently
        // bind an empty, newly-created host directory instead.
        stage('Manage demo EC2 instance (Terraform)') {
            steps {
                sh """
                    docker run --rm -v jenkins_home:/var/jenkins_home -w ${WORKSPACE}/terraform hashicorp/terraform:latest init -input=false
                """
                script {
                    if (!(params.SERVER_NUMBER ==~ /[0-9]+/)) {
                        error('SERVER_NUMBER must contain digits only.')
                    }
                    timedStage('Manage demo EC2 instance (Terraform)') {
                        if (params.INFRA_ACTION == 'DESTROY') {
                            sh """
                                docker run --rm -v jenkins_home:/var/jenkins_home -w ${WORKSPACE}/terraform hashicorp/terraform:latest destroy -auto-approve -input=false -var=build_number=${BUILD_NUMBER} -var=server_number=${params.SERVER_NUMBER}
                            """
                        } else {
                            sh """
                                docker run --rm -v jenkins_home:/var/jenkins_home -w ${WORKSPACE}/terraform hashicorp/terraform:latest apply -auto-approve -input=false -var=build_number=${BUILD_NUMBER} -var=server_number=${params.SERVER_NUMBER}
                                docker run --rm -v jenkins_home:/var/jenkins_home -w ${WORKSPACE}/terraform hashicorp/terraform:latest output -raw private_key_pem > terraform/server-${params.SERVER_NUMBER}.pem
                            """
                            instanceDetails = new JsonSlurperClassic().parseText(sh(
                                returnStdout: true,
                                script: "docker run --rm -v jenkins_home:/var/jenkins_home -w ${WORKSPACE}/terraform hashicorp/terraform:latest output -json"
                            ).trim())
                            sh "chmod 600 terraform/server-${params.SERVER_NUMBER}.pem"
                            archiveArtifacts artifacts: "terraform/server-${params.SERVER_NUMBER}.pem", fingerprint: true
                        }
                    }
                }
            }
        }
    }

    post {
        success {
            script {
                if (params.INFRA_ACTION == 'DESTROY') {
                    echo "Demo EC2 instance destroyed (build ${IMAGE_TAG}). Stage durations: ${stageDurations}"
                    notifyGoogleChat("""⚠️ *${JOB_NAME}* build #${BUILD_NUMBER}: EC2 server #${params.SERVER_NUMBER} destroyed.
Stage durations: ${stageDurations}
<${BUILD_URL}|View build>""")
                } else {
                    def details = [
                        id: instanceDetails.instance_id?.value ?: 'n/a',
                        publicIp: instanceDetails.public_ip?.value ?: 'n/a',
                        privateIp: instanceDetails.private_ip?.value ?: 'n/a',
                        zone: instanceDetails.availability_zone?.value ?: 'n/a',
                        key: instanceDetails.key_name?.value ?: "jenkins-demo-server-${params.SERVER_NUMBER}",
                        pem: "${BUILD_URL}artifact/terraform/server-${params.SERVER_NUMBER}.pem"
                    ]
                    echo "Deployed build ${IMAGE_TAG}. Instance: ${details}. Stage durations: ${stageDurations}"
                    notifyGoogleChat("""✅ *${JOB_NAME}* build #${BUILD_NUMBER} succeeded.
Instance: ${details.id}
Public IP: ${details.publicIp}
Private IP: ${details.privateIp}
Availability zone: ${details.zone}
AWS key pair: ${details.key}
PEM: protected Jenkins artifact — ${details.pem}
Stage durations: ${stageDurations}
<${BUILD_URL}|View build>""")
                }
            }
        }
        failure {
            echo "Pipeline failed - deployment did not run or was interrupted."
            notifyGoogleChat("❌ *${JOB_NAME}* build #${BUILD_NUMBER} failed. <${BUILD_URL}console|View console log>")
        }
        always {
            sh "rm -f terraform/server-${params.SERVER_NUMBER}.pem || true"
            sh 'docker logout || true'
        }
    }
}
