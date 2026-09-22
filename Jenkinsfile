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

pipeline {
    agent any

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
                checkout scm
            }
        }

        stage('SonarQube Analysis') {
            steps {
                script {
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

        stage('Quality Gate') {
            steps {
                // abortPipeline: true -- a failing SonarQube quality gate now stops the
                // pipeline here, before Build/Push/Deploy ever run.
                timeout(time: 5, unit: 'MINUTES') {
                    waitForQualityGate abortPipeline: true
                }
            }
        }

        stage('Build images') {
            steps {
                script {
                    SERVICES.split(' ').each { svc ->
                        sh "docker build -t ${REGISTRY}/${svc}:${IMAGE_TAG} -t ${REGISTRY}/${svc}:latest ./services/${svc}"
                    }
                }
            }
        }

        stage('Push images') {
            steps {
                withCredentials([usernamePassword(
                    credentialsId: 'dockerhub-credentials',
                    usernameVariable: 'DOCKER_USER',
                    passwordVariable: 'DOCKER_PASS'
                )]) {
                    sh 'echo "$DOCKER_PASS" | docker login -u "$DOCKER_USER" --password-stdin'
                    script {
                        SERVICES.split(' ').each { svc ->
                            sh "docker push ${REGISTRY}/${svc}:${IMAGE_TAG}"
                            sh "docker push ${REGISTRY}/${svc}:latest"
                        }
                    }
                }
            }
        }

        stage('Deploy to server') {
            steps {
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

        // Demo only: on a successful build, provision exactly one EC2
        // instance via Terraform. Not an auto-scaler -- proves Jenkins can
        // drive infrastructure-as-code. Placed last so it only runs once
        // everything before it (build/push/deploy) has already succeeded.
        stage('Provision demo EC2 instance (Terraform)') {
            steps {
                sh """
                    docker run --rm \
                      -v \$(pwd)/terraform:/workspace \
                      -w /workspace \
                      --entrypoint /bin/sh \
                      hashicorp/terraform:latest \
                      -c "terraform init -input=false && terraform apply -auto-approve -input=false -var='build_number=${BUILD_NUMBER}'"
                """
            }
        }
    }

    post {
        success {
            echo "Deployed build ${IMAGE_TAG} successfully."
            notifyGoogleChat("✅ *${JOB_NAME}* build #${BUILD_NUMBER} succeeded — deployed to ${DOMAIN}. <${BUILD_URL}|View build>")
        }
        failure {
            echo "Pipeline failed - deployment did not run or was interrupted."
            notifyGoogleChat("❌ *${JOB_NAME}* build #${BUILD_NUMBER} failed. <${BUILD_URL}console|View console log>")
        }
        always {
            sh 'docker logout || true'
        }
    }
}
