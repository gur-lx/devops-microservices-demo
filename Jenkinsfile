pipeline {
    agent any

    environment {
        REGISTRY        = 'docker.io/yourdockerhubusername'   // change me
        IMAGE_TAG       = "${env.BUILD_NUMBER}"
        SERVICES        = 'frontend api-gateway user-service product-service'
        DEPLOY_HOST     = 'deploy-server'                       // SSH host alias, see GUIDE.md
        DEPLOY_USER     = 'deployer'
        DEPLOY_PATH     = '/opt/devops-microservices-demo'
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
                        scp -o StrictHostKeyChecking=no docker-compose.prod.yml ${DEPLOY_USER}@${DEPLOY_HOST}:${DEPLOY_PATH}/docker-compose.yml
                        ssh -o StrictHostKeyChecking=no ${DEPLOY_USER}@${DEPLOY_HOST} '\
                            cd ${DEPLOY_PATH} && \
                            export REGISTRY=${REGISTRY} && \
                            export IMAGE_TAG=${IMAGE_TAG} && \
                            docker compose pull && \
                            docker compose up -d --remove-orphans && \
                            docker image prune -f \
                        '
                    """
                }
            }
        }
    }

    post {
        success {
            echo "Deployed build ${IMAGE_TAG} successfully."
        }
        failure {
            echo "Pipeline failed - deployment did not run or was interrupted."
        }
        always {
            sh 'docker logout || true'
        }
    }
}
